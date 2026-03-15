"""Motor principal del solver CP-SAT.

Orquesta el flujo completo: parseo del payload → generación de candidatos
→ construcción del modelo CP-SAT → resolución → fallback greedy si falla.

Contrato de entrada (nuevo formato v2):
{
  "user": {"id": "...", "timezone": "America/Mexico_City"},
  "horizon": {"start": "ISO", "end": "ISO", "slotMinutes": 5},
  "availability": {
    "preferred": [{"start": "ISO", "end": "ISO"}],
    "fallbackUsed": false
  },
  "events": {
    "fixed":    [{"id": "...", "start": "ISO", "end": "ISO", "blocksCapacity": true}],
    "movable":  [{"id": "...", "priority": "UnI"|"InU", "durationMin": 60,
                  "canOverlap": false, "currentStart": "ISO"|null,
                  "window": "PRONTO"|"SEMANA"|"MES"|"RANGO",
                  "windowStart": "ISO"|null, "windowEnd": "ISO"|null,
                  "categoryRank": 1}],
    "new":      [...mismo que movable sin currentStart...],
    "newFixed": [...mismo que fixed...]
  },
  "config": {
    "stability": "flexible"|"balanced"|"fixed",
    "categories": [{"name": "Trabajo", "rank": 1}],
    "bufferMinutes": 15,
    "leadMinutes": 10,
    "dayStart": "09:00",
    "dayEnd": "18:00",
    "activeDays": [0, 1, 2, 3, 4]   ← 0=lun..6=dom (Python weekday convention)
  }
}
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo

from ortools.sat.python import cp_model

from .candidates import generate_candidates
from .constraints import (
    add_exactly_one_constraints,
    add_no_overlap_constraint,
    build_objective,
    create_fixed_intervals,
    create_interval_vars,
)
from .greedy import greedy_schedule
from .models import (
    CandidateCost,
    CategoryInfo,
    EventPriority,
    FixedEvent,
    FlexibleEvent,
    Horizon,
    MovedEvent,
    PlacedEvent,
    SolverConfig,
    SolverDiagnostics,
    SolverResult,
    StabilityMode,
    UnplacedEvent,
    WindowType,
    build_horizon,
)

_DEGRADATION_THRESHOLD = 50


def solve_schedule(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Punto de entrada principal del solver. Recibe JSON crudo, retorna JSON crudo.

    Flujo:
        1. Parsear payload a modelos tipados.
        2. Validar: detectar conflictos UI/UI entre fijos.
        3. Si hay >50 flexibles, aplicar degradación.
        4. Para cada evento flexible: generar candidatos.
        5. Construir modelo CP-SAT y resolver (timeout 5s, gap 5%).
        6. Si falla o timeout: intentar greedy fallback.
        7. Retornar SolverResult serializado.

    Args:
        payload: Diccionario con el contrato de entrada del solver.

    Returns:
        Diccionario con placed, moved, unplaced, score y diagnostics.
    """
    try:
        tz = ZoneInfo(payload["user"]["timezone"])
        h = payload["horizon"]
        slot_minutes = int(h["slotMinutes"])

        start_dt = _parse_iso(h["start"], tz)
        end_dt = _parse_iso(h["end"], tz)
        horizon = build_horizon(start_dt, end_dt, slot_minutes, payload["user"]["timezone"])

        now_local = datetime.now(tz)
        config_json = payload["config"]
        config, working_slots, allowed_days, now_slot = _parse_config(
            config_json, horizon, now_local,
        )

        preferred_slots = _build_preferred_slots(
            payload.get("availability", {}), tz, horizon, working_slots,
        )

        fixed_json = payload["events"].get("fixed", []) + payload["events"].get("newFixed", [])
        fixed, hard_conflicts = _parse_fixed_events(fixed_json, horizon, tz)

        if hard_conflicts:
            return SolverResult(
                placed=[], moved=[], unplaced=[], score=None,
                diagnostics=SolverDiagnostics(
                    hard_conflicts=hard_conflicts,
                    summary="Infeasible: UI/UI conflict",
                ),
            ).to_dict()

        flex = (
            _parse_flexible_events(payload["events"].get("movable", []), horizon, tz, slot_minutes, has_current=True)
            + _parse_flexible_events(payload["events"].get("new", []), horizon, tz, slot_minutes, has_current=False)
        )

        extra_fixed: List[FixedEvent] = []
        if len(flex) > _DEGRADATION_THRESHOLD:
            flex, extra_fixed = _apply_degradation(flex, config.max_flexible_events)

        all_fixed = fixed + extra_fixed
        fixed_blocking = [f for f in all_fixed if f.blocks_capacity]

        all_candidates: Dict[str, List[int]] = {}
        all_costs: Dict[Tuple[str, int], CandidateCost] = {}

        for ev in flex:
            slots, cost_map = generate_candidates(
                ev, horizon, config, fixed_blocking, now_slot,
                preferred_slots, working_slots, allowed_days,
            )
            all_candidates[ev.id] = slots
            for s, c in cost_map.items():
                all_costs[(ev.id, s)] = c

        immediate_unplaced = [
            UnplacedEvent(id=ev.id, reason="NoFeasibleCandidates")
            for ev in flex if not all_candidates.get(ev.id)
        ]
        flex = [ev for ev in flex if all_candidates.get(ev.id)]

        if not flex:
            return SolverResult(
                placed=[], moved=[], unplaced=immediate_unplaced, score=None,
                diagnostics=SolverDiagnostics([], "Sin eventos con candidatos factibles"),
            ).to_dict()

        model = cp_model.CpModel()
        x_vars: Dict[Tuple[str, int], cp_model.IntVar] = {}
        x_vars_by_event: Dict[str, List[Tuple[int, cp_model.IntVar]]] = {}
        all_intervals: List[cp_model.IntervalVar] = []

        for ev in flex:
            slot_vars = []
            for s in all_candidates[ev.id]:
                v = model.NewBoolVar(f"x_{ev.id}_{s}")
                x_vars[(ev.id, s)] = v
                slot_vars.append((s, v))
            x_vars_by_event[ev.id] = slot_vars

            ivs = create_interval_vars(
                model, ev.id, all_candidates[ev.id], x_vars,
                ev.duration_slots, config.buffer_slots, ev.can_overlap,
            )
            all_intervals.extend(ivs)

        all_intervals.extend(create_fixed_intervals(model, fixed_blocking))
        add_exactly_one_constraints(model, x_vars_by_event)
        add_no_overlap_constraint(model, all_intervals)
        build_objective(model, flex, x_vars, all_costs, all_candidates)

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = config.timeout_seconds
        solver.parameters.relative_gap_limit = config.gap_limit
        solver.parameters.num_search_workers = 8

        status = solver.Solve(model)

        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            result = _build_result_from_solver(
                solver, flex, all_candidates, all_costs, x_vars, horizon, immediate_unplaced,
            )
            return result.to_dict()

        status_label = "INFEASIBLE" if status == cp_model.INFEASIBLE else "TIMEOUT"
        greedy_result = greedy_schedule(
            flex, all_fixed, horizon, config,
            preferred_slots, working_slots, allowed_days, now_slot,
        )
        greedy_result.unplaced.extend(immediate_unplaced)
        greedy_result.diagnostics.summary = (
            f"Greedy fallback (CP-SAT: {status_label}). {greedy_result.diagnostics.summary}"
        )
        return greedy_result.to_dict()

    except Exception as exc:
        return SolverResult(
            placed=[], moved=[], unplaced=[], score=None,
            diagnostics=SolverDiagnostics(
                hard_conflicts=[str(exc)],
                summary=f"Error interno del solver: {type(exc).__name__}",
            ),
        ).to_dict()


# ---------------------------------------------------------------------------
# Parseo del payload
# ---------------------------------------------------------------------------

def _parse_fixed_events(
    events_json: List[Dict],
    horizon: Horizon,
    tz: ZoneInfo,
) -> Tuple[List[FixedEvent], List[str]]:
    """Convierte la lista de eventos fijos del payload a FixedEvent tipados.

    Detecta conflictos UI/UI (dos eventos fijos bloqueantes que se solapan).

    Args:
        events_json: Lista de dicts del payload (fixed + newFixed combinados).
        horizon: Horizonte temporal del solver.
        tz: Zona horaria del usuario.

    Returns:
        Tupla (lista de FixedEvent, lista de mensajes de conflicto).
    """
    fixed: List[FixedEvent] = []
    for f in events_json:
        start = _parse_iso(f["start"], tz)
        end = _parse_iso(f["end"], tz)
        s = horizon.dt_to_slot(start)
        e = horizon.dt_to_slot(end)
        if horizon.slot_to_dt(e) < end:
            e += 1
        s = max(s, 0)
        e = min(e, horizon.total_slots)
        if e <= s:
            continue
        fixed.append(FixedEvent(
            id=f["id"],
            start_slot=s,
            end_slot=e,
            blocks_capacity=bool(f.get("blocksCapacity", True)),
        ))

    hard_conflicts: List[str] = []
    blocking = [f for f in fixed if f.blocks_capacity]
    for i in range(len(blocking)):
        for j in range(i + 1, len(blocking)):
            a, b = blocking[i], blocking[j]
            if not (a.end_slot <= b.start_slot or b.end_slot <= a.start_slot):
                hard_conflicts.append(f"UI/UI conflict: {a.id} vs {b.id}")

    return fixed, hard_conflicts


def _parse_flexible_events(
    events_json: List[Dict],
    horizon: Horizon,
    tz: ZoneInfo,
    slot_minutes: int,
    has_current: bool,
) -> List[FlexibleEvent]:
    """Convierte la lista de eventos flexibles del payload a FlexibleEvent tipados.

    Args:
        events_json: Lista de dicts del payload (movable o new).
        horizon: Horizonte temporal del solver.
        tz: Zona horaria del usuario.
        slot_minutes: Granularidad en minutos.
        has_current: True para eventos movable (tienen currentStart), False para new.

    Returns:
        Lista de FlexibleEvent tipados.
    """
    flex: List[FlexibleEvent] = []
    for m in events_json:
        cur_start_slot: Optional[int] = None
        if has_current and m.get("currentStart"):
            cur_start_slot = horizon.dt_to_slot(_parse_iso(m["currentStart"], tz))

        duration_slots = max(1, math.ceil(int(m["durationMin"]) / slot_minutes))

        wstart_slot: Optional[int] = None
        wend_slot: Optional[int] = None
        if m.get("windowStart"):
            wstart_slot = horizon.dt_to_slot(_parse_iso(m["windowStart"], tz))
        if m.get("windowEnd"):
            wend_slot = horizon.dt_to_slot(_parse_iso(m["windowEnd"], tz))

        flex.append(FlexibleEvent(
            id=m["id"],
            priority=EventPriority(m["priority"]),
            duration_slots=duration_slots,
            can_overlap=bool(m.get("canOverlap", False)),
            current_start_slot=cur_start_slot,
            window_type=WindowType(m.get("window", "NONE")),
            window_start_slot=wstart_slot,
            window_end_slot=wend_slot,
            category_rank=int(m.get("categoryRank", 1)),
        ))
    return flex


def _parse_config(
    config_json: Dict,
    horizon: Horizon,
    now_local: datetime,
) -> Tuple[SolverConfig, Set[int], Set[int], int]:
    """Parsea la sección config del payload.

    Args:
        config_json: Diccionario config del payload.
        horizon: Horizonte temporal del solver.
        now_local: Datetime actual en la zona horaria del usuario.

    Returns:
        Tupla (SolverConfig, working_slots, allowed_days, now_slot).
    """
    stability = StabilityMode(config_json.get("stability", "balanced"))
    categories_raw = config_json.get("categories", [])
    categories = [CategoryInfo(name=c["name"], rank=c["rank"]) for c in categories_raw]
    total_categories = max(len(categories), 1)

    buffer_minutes = _safe_int(config_json.get("bufferMinutes"), 0)
    buffer_slots = math.ceil(buffer_minutes / horizon.slot_minutes) if buffer_minutes else 0

    lead_minutes = _safe_int(config_json.get("leadMinutes"), 0)
    now_slot = max(0, horizon.dt_to_next_slot(now_local + timedelta(minutes=lead_minutes)))

    day_start = _parse_hhmm(config_json.get("dayStart"), (9, 0))
    day_end = _parse_hhmm(config_json.get("dayEnd"), (18, 0))

    # activeDays en convención Python weekday: 0=lun..6=dom
    allowed_days: Set[int] = set()
    for d in config_json.get("activeDays", []):
        try:
            val = int(d)
            if 0 <= val <= 6:
                allowed_days.add(val)
        except (TypeError, ValueError):
            continue
    if not allowed_days:
        allowed_days = set(range(7))

    working_slots: Set[int] = set()
    cur = horizon.start_dt
    while cur < horizon.end_dt:
        if cur.weekday() in allowed_days:
            a = cur.replace(hour=day_start[0], minute=day_start[1], second=0, microsecond=0)
            b = cur.replace(hour=day_end[0], minute=day_end[1], second=0, microsecond=0)
            if b <= a:
                a = cur.replace(hour=0, minute=0, second=0, microsecond=0)
                b = a + timedelta(days=1)
            working_slots.update(horizon.slots_in_interval(a, b))
        cur = (cur + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)

    config = SolverConfig(
        buffer_slots=buffer_slots,
        lead_time_slot=now_slot,
        stability=stability,
        categories=categories,
        total_categories=total_categories,
    )
    return config, working_slots, allowed_days, now_slot


def _build_preferred_slots(
    availability: Dict,
    tz: ZoneInfo,
    horizon: Horizon,
    working_slots: Set[int],
) -> Set[int]:
    """Construye el conjunto de slots preferidos del usuario.

    Si hay rangos de preferencia explícitos en el payload, los usa.
    Si no (fallback), usa los working_slots como preferred.

    Args:
        availability: Sección availability del payload.
        tz: Zona horaria del usuario.
        horizon: Horizonte temporal del solver.
        working_slots: Slots en horario laboral (fallback).

    Returns:
        Conjunto de slots preferidos.
    """
    preferred_ranges = availability.get("preferred", [])
    if preferred_ranges:
        preferred: Set[int] = set()
        for r in preferred_ranges:
            a = _parse_iso(r["start"], tz)
            b = _parse_iso(r["end"], tz)
            preferred.update(horizon.slots_in_interval(a, b))
        return preferred
    return set(working_slots)


def _apply_degradation(
    flex: List[FlexibleEvent],
    max_events: int,
) -> Tuple[List[FlexibleEvent], List[FixedEvent]]:
    """Aplica degradación cuando hay más de _DEGRADATION_THRESHOLD eventos flexibles.

    Todos los urgentes participan. Los relevantes se filtran por categoría
    (mejor categoría primero) hasta completar max_events. Los restantes
    se congelan en su posición actual como eventos fijos temporales.

    Args:
        flex: Lista completa de eventos flexibles.
        max_events: Máximo de eventos que participan en el solver (60).

    Returns:
        Tupla (eventos que participan, eventos congelados como FixedEvent).
    """
    urgents = [e for e in flex if e.priority == EventPriority.URGENT]
    relevants = sorted(
        [e for e in flex if e.priority == EventPriority.RELEVANT],
        key=lambda e: e.category_rank,
    )

    remaining_slots = max(0, max_events - len(urgents))
    participating = urgents + relevants[:remaining_slots]
    frozen_relevants = relevants[remaining_slots:]

    frozen_fixed: List[FixedEvent] = []
    for ev in frozen_relevants:
        if ev.current_start_slot is not None:
            frozen_fixed.append(FixedEvent(
                id=ev.id,
                start_slot=ev.current_start_slot,
                end_slot=ev.current_start_slot + ev.duration_slots,
                blocks_capacity=not ev.can_overlap,
            ))

    return participating, frozen_fixed


def _build_result_from_solver(
    solver: cp_model.CpSolver,
    flex: List[FlexibleEvent],
    all_candidates: Dict[str, List[int]],
    all_costs: Dict[Tuple[str, int], CandidateCost],
    x_vars: Dict[Tuple[str, int], cp_model.IntVar],
    horizon: Horizon,
    immediate_unplaced: List[UnplacedEvent],
) -> SolverResult:
    """Construye un SolverResult a partir de la solución del CP-SAT.

    Args:
        solver: Instancia del solver con la solución encontrada.
        flex: Eventos flexibles que participaron en el modelo.
        all_candidates: Candidatos por evento.
        all_costs: Costos por (event_id, slot).
        x_vars: Variables booleanas del modelo.
        horizon: Horizonte temporal del solver.
        immediate_unplaced: Eventos sin candidatos (ya marcados antes del modelo).

    Returns:
        SolverResult con placed, moved, unplaced y score.
    """
    placed: List[PlacedEvent] = []
    moved: List[MovedEvent] = []
    unplaced: List[UnplacedEvent] = list(immediate_unplaced)
    total_cost = 0

    for ev in flex:
        chosen_s: Optional[int] = None
        for s in all_candidates[ev.id]:
            if solver.Value(x_vars[(ev.id, s)]) == 1:
                chosen_s = s
                total_cost += all_costs[(ev.id, s)].total
                break

        if chosen_s is None:
            unplaced.append(UnplacedEvent(id=ev.id, reason="NoChosenStart"))
            continue

        start_dt = horizon.slot_to_dt(chosen_s)
        end_dt = horizon.slot_to_dt(chosen_s + ev.duration_slots)

        placed.append(PlacedEvent(
            id=ev.id,
            start_iso=start_dt.isoformat(),
            end_iso=end_dt.isoformat(),
        ))

        if ev.current_start_slot is not None and ev.current_start_slot != chosen_s:
            moved.append(MovedEvent(
                id=ev.id,
                from_start_iso=horizon.slot_to_dt(ev.current_start_slot).isoformat(),
                to_start_iso=start_dt.isoformat(),
                reason="RepositionedByPolicy",
            ))

    return SolverResult(
        placed=placed,
        moved=moved,
        unplaced=unplaced,
        score=int(total_cost),
        diagnostics=SolverDiagnostics(
            hard_conflicts=[],
            summary=f"Placed {len(placed)}, moved {len(moved)}, unplaced {len(unplaced)}",
        ),
    )


# ---------------------------------------------------------------------------
# Utilidades de parseo (internas al módulo)
# ---------------------------------------------------------------------------

def _parse_iso(s: str, tz: ZoneInfo) -> datetime:
    """Parsea un string ISO 8601 y lo convierte a la zona horaria dada.

    Acepta strings con o sin zona horaria; si no trae tz, asume la del usuario.

    Args:
        s: String en formato ISO 8601.
        tz: Zona horaria de destino.

    Returns:
        Datetime en la zona horaria indicada.
    """
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return dt.astimezone(tz)


def _parse_hhmm(value: Any, default: Tuple[int, int]) -> Tuple[int, int]:
    """Parsea un string "HH:mm" a tupla (hora, minuto).

    Args:
        value: String "HH:mm" o None.
        default: Tupla a retornar si el parseo falla.

    Returns:
        Tupla (hora, minuto).
    """
    try:
        if isinstance(value, str):
            parts = value.strip().split(":")
            if len(parts) >= 2:
                h, m = int(parts[0]), int(parts[1])
                if 0 <= h <= 23 and 0 <= m <= 59:
                    return (h, m)
    except (ValueError, TypeError):
        pass
    return default


def _safe_int(value: Any, default: int = 0) -> int:
    """Parsea un valor a entero no negativo de forma segura.

    Args:
        value: Valor a convertir.
        default: Valor a retornar si falla la conversión.

    Returns:
        Entero no negativo.
    """
    try:
        if value is None:
            return default
        return max(0, int(value))
    except (ValueError, TypeError):
        return default
