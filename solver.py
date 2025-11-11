#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Agenda Inteligente — Solver CSP (OR-Tools CP-SAT)
-------------------------------------------------
- Lee un JSON con el contrato acordado en stdin o desde un archivo (argv[1]).
- Devuelve un JSON con la asignación propuesta.

Contrato de ENTRADA (resumen):
{
  "user": {"id":"...", "timezone":"America/Mexico_City"},
  "horizon": {"start": ISO, "end": ISO, "slotMinutes": 30},
  "availability": {
    "preferred": [{"start": ISO, "end": ISO}, ...],   # expandido o vacío si se usa fallback
    "fallbackUsed": true|false
  },
  "events": {
    "fixed":     [{"id": "...", "start": ISO, "end": ISO, "blocksCapacity": true}],
    "movable":   [{"id":"...", "priority":"UnI"|"InU", "durationMin":60, "isInPerson":true, "canOverlap":false,
                   "currentStart": ISO|null, "window":"PRONTO"|"SEMANA"|"MES"|"RANGO",
                   "windowStart": ISO|null, "windowEnd": ISO|null}],
    "new":       [{"id":"tmp_1", "priority":"UnI"|"InU", "durationMin":30, "isInPerson":false, "canOverlap":true,
                   "window":"...", "windowStart": ISO|null, "windowEnd": ISO|null}],
    "newFixed":  [{"id":"tmp_UI_1", "priority":"UI", "start":ISO, "end":ISO, "isInPerson":true, "canOverlap":false}]
  },
  "weights": {
    "move": {"UnI":20, "InU":10},
    "distancePerSlot": {"UnI":4, "InU":1},
    "offPreferencePerSlot": {"UnI":1, "InU":3},
    "crossDayPerEvent": {"UnI":2, "InU":1}
  },
  "policy": {
    "allowWeekend": false,
    "noOverlapCapacity": 1,
    "remoteCapacity": 9999
  }
}

Contrato de SALIDA:
{
  "placed":[{"id":"...", "start":ISO, "end":ISO}, ...],
  "moved":[{"id":"...", "fromStart":ISO|null, "toStart":ISO, "reason": "..."}, ...],
  "unplaced":[{"id":"...", "reason":"..."}],
  "score": <int|null>,
  "diagnostics":{"hardConflicts":[], "summary":"..."}
}
"""

from __future__ import annotations
import sys, json, math, argparse
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple, Optional, Set
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ortools.sat.python import cp_model

# -----------------------------
# Utilidades de tiempo / slots
# -----------------------------

@dataclass
class Horizon:
    tz: ZoneInfo
    start_dt: datetime
    end_dt: datetime
    slot_minutes: int

    def __post_init__(self):
        assert self.start_dt.tzinfo is not None and self.end_dt.tzinfo is not None
        assert self.start_dt <= self.end_dt
        assert self.slot_minutes > 0

    @property
    def slot_delta(self) -> timedelta:
        return timedelta(minutes=self.slot_minutes)

    def dt_to_slot(self, dt: datetime) -> int:
        # redondea hacia abajo al inicio de slot
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=self.tz)
        dt = dt.astimezone(self.tz)
        diff = dt - self.start_dt
        slots = diff.total_seconds() / (self.slot_minutes * 60)
        return int(math.floor(slots))

    def dt_to_next_slot(self, dt: datetime) -> int:
        # redondea hacia arriba al siguiente slot
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=self.tz)
        dt = dt.astimezone(self.tz)
        base = self.dt_to_slot(dt)
        if self.slot_to_dt(base) < dt:
            return base + 1
        return base

    def slot_to_dt(self, s: int) -> datetime:
        return self.start_dt + s * self.slot_delta

    def slots_in_interval(self, a: datetime, b: datetime) -> range:
        """Slots [startSlot, endSlot) que cubren [a,b)."""
        sa = self.dt_to_slot(a)
        sb = self.dt_to_slot(b)
        # si b no cae exactamente, incluir el slot que lo cubre
        if self.slot_to_dt(sb) < b:
            sb += 1
        sa = max(sa, 0)
        sb = min(sb, self.total_slots)
        return range(sa, max(sa, sb))

    @property
    def total_slots(self) -> int:
        diff = self.end_dt - self.start_dt
        return math.ceil(diff.total_seconds() / (self.slot_minutes * 60))


def parse_iso_localized(s: str, tz: ZoneInfo) -> datetime:
    # Acepta ISO con o sin tz; si no trae tz, asumir tz del usuario
    dt = datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None
    if dt is None:
        raise ValueError("Fecha inválida")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return dt.astimezone(tz)


def day_index(dt: datetime) -> Tuple[int, int, int]:
    dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return (dt.year, dt.month, dt.day)


def parse_hhmm(value: Any, default: Tuple[int, int]) -> Tuple[int, int]:
    try:
        if isinstance(value, str):
            parts = value.strip().split(":")
            if len(parts) >= 2:
                h = int(parts[0])
                m = int(parts[1])
                if 0 <= h <= 23 and 0 <= m <= 59:
                    return (h, m)
        elif isinstance(value, (tuple, list)) and len(value) >= 2:
            h = int(value[0])
            m = int(value[1])
            if 0 <= h <= 23 and 0 <= m <= 59:
                return (h, m)
    except (ValueError, TypeError):
        pass
    return default


def safe_positive_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        n = int(value)
        return max(0, n)
    except (ValueError, TypeError):
        return default


# -----------------------------
# Estructuras del problema
# -----------------------------

@dataclass
class FixedEvent:
    id: str
    start_slot: int
    end_slot: int
    blocks_capacity: bool

@dataclass
class FlexibleEvent:
    id: str
    priority: str  # "UnI" | "InU"
    duration_slots: int
    overlap: bool  # True si puede solaparse
    current_start_slot: Optional[int]  # para "movable"
    window: str    # PRONTO | SEMANA | MES | RANGO
    window_start: Optional[int]
    window_end: Optional[int]


@dataclass
class Costs:
    total: int
    dist: int
    offpref: int
    crossday: int
    movecost: int


# -----------------------------
# Generación de candidatos
# -----------------------------

def is_weekend(dt: datetime) -> bool:
    # 0=Mon..6=Sun
    return dt.weekday() >= 5

def expand_window_slots(ev: FlexibleEvent, horizon: Horizon, now_slot: int) -> range:
    """
    Devuelve rango bruto [a,b) de slots donde puede empezar, según la ventana.
    El filtrado fino (preferencias, fixed, etc.) se hace después.
    """
    if ev.window == "PRONTO":
        a = max(now_slot, 0)
        b = min(now_slot + math.ceil((48 * 60) / horizon.slot_minutes), horizon.total_slots)
        return range(a, b)

    if ev.window == "SEMANA":
        # lunes 00:00 a domingo 23:59 de la semana actual (ISO)
        start = horizon.start_dt
        weekday = start.isoweekday()  # 1..7 (lun..dom)
        monday = start - timedelta(days=weekday - 1)
        monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
        sunday_end = monday + timedelta(days=7)
        a = max(horizon.dt_to_slot(monday), 0)
        b = min(horizon.dt_to_slot(sunday_end), horizon.total_slots)
        return range(a, b)

    if ev.window == "MES":
        start = horizon.start_dt
        month_start = start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if start.month == 12:
            next_month = start.replace(year=start.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            next_month = start.replace(month=start.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        a = max(horizon.dt_to_slot(month_start), 0)
        b = min(horizon.dt_to_slot(next_month), horizon.total_slots)
        return range(a, b)

    if ev.window == "RANGO":
        # YA VIENEN COMO ÍNDICES DE SLOT (ints) desde solve_schedule
        if ev.window_start is None or ev.window_end is None:
            return range(0, 0)
        a = max(int(ev.window_start), 0)
        b = min(int(ev.window_end), horizon.total_slots)
        return range(a, b)

    # Sin ventana específica: todo el horizonte
    return range(0, horizon.total_slots)


def remove_conflicting_starts(
    starts: List[int], dur: int, fixed: List[FixedEvent], buffer_slots: int = 0
) -> List[int]:
    """
    Filtra starts que chocarían con intervalos fijos que SI bloquean capacidad.
    """
    if not fixed:
        return starts
    out = []
    for s in starts:
        event_start = s
        event_end = s + dur
        conflict = False
        for f in fixed:
            if not f.blocks_capacity:
                continue
            if not (
                event_end + buffer_slots <= f.start_slot
                or event_start >= f.end_slot + buffer_slots
            ):
                conflict = True
                break
        if not conflict:
            out.append(s)
    return out


def reduce_candidates(priority: str, starts: List[int], k: int = 200) -> List[int]:
    """
    Para performance: limitamos candidatos.
    - UnI: prioriza los mas tempranos.
    - InU: similar.
    """
    return starts[:k]


# -----------------------------
# Costos
# -----------------------------

def count_offpref_slots(s: int, dur: int, preferred_set: Set[int]) -> int:
    return sum(1 for t in range(s, s + dur) if t not in preferred_set)

def crosses_day(s: int, dur: int, horizon: Horizon) -> int:
    if dur <= 0:
        return 0
    d1 = day_index(horizon.slot_to_dt(s))
    d2 = day_index(horizon.slot_to_dt(s + dur - 1))
    return 0 if d1 == d2 else 1


# -----------------------------
# Solver principal
# -----------------------------

def solve_schedule(payload: Dict[str, Any]) -> Dict[str, Any]:
    tz = ZoneInfo(payload["user"]["timezone"])
    h = payload["horizon"]
    slot_minutes = int(h["slotMinutes"])

    start_dt = parse_iso_localized(h["start"], tz)
    end_dt = parse_iso_localized(h["end"], tz)
    horizon = Horizon(tz=tz, start_dt=start_dt, end_dt=end_dt, slot_minutes=slot_minutes)

    policy = payload.get("policy", {})
    allowed_days = set()
    for d in policy.get("activeDays", []):
        try:
            val = int(d)
            if 0 <= val <= 6:
                allowed_days.add(val)
        except (TypeError, ValueError):
            continue
    if not allowed_days:
        allowed_days = set(range(7))

    day_start_tuple = parse_hhmm(policy.get("dayStart"), (9, 0))
    day_end_tuple = parse_hhmm(policy.get("dayEnd"), (18, 0))
    buffer_minutes = safe_positive_int(policy.get("eventBufferMinutes"), 0)
    buffer_slots = math.ceil(buffer_minutes / slot_minutes) if buffer_minutes else 0
    lead_minutes = safe_positive_int(policy.get("schedulingLeadMinutes"), 0)

    # now_slot: para PRONTO y distancia
    now_local = datetime.now(tz)
    now_slot = max(0, horizon.dt_to_next_slot(now_local + timedelta(minutes=lead_minutes)))

    # preferred slots: si viene expandido, lo usamos; si no, fallback básico 9-18 (L-V), 10-14 (Sáb)
    preferred_ranges = payload.get("availability", {}).get("preferred", [])
    preferred_slots: Set[int] = set()
    if preferred_ranges:
        for r in preferred_ranges:
            a = parse_iso_localized(r["start"], tz)
            b = parse_iso_localized(r["end"], tz)
            preferred_slots.update(horizon.slots_in_interval(a, b))
    else:
        cur = horizon.start_dt
        while cur < horizon.end_dt:
            dow = cur.weekday()
            if dow in allowed_days:
                a = cur.replace(
                    hour=day_start_tuple[0],
                    minute=day_start_tuple[1],
                    second=0,
                    microsecond=0
                )
                b = cur.replace(
                    hour=day_end_tuple[0],
                    minute=day_end_tuple[1],
                    second=0,
                    microsecond=0
                )
                if b <= a:
                    a = cur.replace(hour=0, minute=0, second=0, microsecond=0)
                    b = (a + timedelta(days=1))
                preferred_slots.update(horizon.slots_in_interval(a, b))
            cur = (cur + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)

    # Fixed events
    fixed_json = payload["events"].get("fixed", []) + payload["events"].get("newFixed", [])
    fixed: List[FixedEvent] = []
    hard_conflicts: List[str] = []

    for f in fixed_json:
        start = parse_iso_localized(f["start"], tz)
        end = parse_iso_localized(f["end"], tz)
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
            blocks_capacity=bool(
                f.get("isInPerson", True) and (not f.get("canOverlap", False)) and f.get("blocksCapacity", True)
            )
        ))

    # Chequeo rápido de conflictos UI vs UI (fixed que bloquean capacidad)
    blocking = [f for f in fixed if f.blocks_capacity]
    for i in range(len(blocking)):
        for j in range(i + 1, len(blocking)):
            a, b = blocking[i], blocking[j]
            if not (a.end_slot <= b.start_slot or b.end_slot <= a.start_slot):
                hard_conflicts.append(f"UI/UI conflict: {a.id} vs {b.id}")

    if hard_conflicts:
        return {
            "placed": [],
            "moved": [],
            "unplaced": [],
            "score": None,
            "diagnostics": {"hardConflicts": hard_conflicts, "summary": "Infeasible: UI/UI conflict"}
        }

    # Política
    # allowed_days already processed arriba

    # Flexible events (movable + new)
    weights = payload["weights"]
    move_w = weights["move"]
    dist_w = weights["distancePerSlot"]
    offpref_w = weights["offPreferencePerSlot"]
    crossday_w = weights["crossDayPerEvent"]

    flex: List[FlexibleEvent] = []

    def duration_to_slots(mins: int) -> int:
        return max(1, math.ceil(mins / slot_minutes))

    # Movable
    for m in payload["events"].get("movable", []):
        cur_start_slot = None
        if m.get("currentStart"):
            cur_dt = parse_iso_localized(m["currentStart"], tz)
            cur_start_slot = horizon.dt_to_slot(cur_dt)
        wstart = parse_iso_localized(m["windowStart"], tz).astimezone(tz) if m.get("windowStart") else None
        wend = parse_iso_localized(m["windowEnd"], tz).astimezone(tz) if m.get("windowEnd") else None
        flex.append(FlexibleEvent(
            id=m["id"],
            priority=m["priority"],
            duration_slots=duration_to_slots(int(m["durationMin"])),
            overlap=(not m.get("isInPerson", True)) or m.get("canOverlap", False),
            current_start_slot=cur_start_slot,
            window=m["window"],
            window_start=horizon.dt_to_slot(wstart) if wstart else None,
            window_end=horizon.dt_to_slot(wend) if wend else None
        ))

    # New
    for n in payload["events"].get("new", []):
        wstart = parse_iso_localized(n["windowStart"], tz).astimezone(tz) if n.get("windowStart") else None
        wend = parse_iso_localized(n["windowEnd"], tz).astimezone(tz) if n.get("windowEnd") else None
        flex.append(FlexibleEvent(
            id=n["id"],
            priority=n["priority"],
            duration_slots=duration_to_slots(int(n["durationMin"])),
            overlap=(not n.get("isInPerson", True)) or n.get("canOverlap", False),
            current_start_slot=None,
            window=n["window"],
            window_start=horizon.dt_to_slot(wstart) if wstart else None,
            window_end=horizon.dt_to_slot(wend) if wend else None
        ))

    # Generación de candidatos + costos por candidato
    candidates: Dict[str, List[int]] = {}
    costs: Dict[Tuple[str, int], Costs] = {}

    # starts fijos que bloquean para filtrado
    fixed_blocking = [f for f in fixed if f.blocks_capacity]

    # Helper: filtrar completamente a "slots preferidos" si hay al menos 1 opción factible allí.
    def filter_to_preferred_if_possible(starts: List[int], dur: int) -> List[int]:
        preferred_starts = []
        for s in starts:
            ok = True
            for t in range(s, s + dur):
                if t not in preferred_slots:
                    ok = False
                    break
            if ok:
                preferred_starts.append(s)
        return preferred_starts if preferred_starts else starts

    # Helper: filtrar días deshabilitados
    def filter_allowed_days(starts: List[int], dur: int) -> List[int]:
        if len(allowed_days) >= 7:
            return starts
        out = []
        for s in starts:
            st = horizon.slot_to_dt(s)
            en = horizon.slot_to_dt(s + dur - 1)
            if st.weekday() not in allowed_days:
                continue
            if en.weekday() not in allowed_days:
                continue
            out.append(s)
        return out

    for e in flex:
        base_range = list(expand_window_slots(e, horizon, now_slot))
        buffer_for_event = buffer_slots if not e.overlap else 0

        # asegura que quepa completo: último inicio posible = end - dur
        latest_start = horizon.total_slots - (e.duration_slots + buffer_for_event)
        if latest_start < 0:
            candidates[e.id] = []
            continue
        base_range = [s for s in base_range if 0 <= s <= latest_start]

        # política de días activos
        base_range = filter_allowed_days(base_range, e.duration_slots)

        # respeta la antelación mínima configurable (solo aplica a urgentes/relevantes)
        if e.priority in ("UnI", "InU") and now_slot > 0:
            filtered = [s for s in base_range if s >= now_slot]
            # si el evento ya estaba programado antes del límite, permitir mantenerlo
            if (
                e.current_start_slot is not None
                and e.current_start_slot < now_slot
                and e.current_start_slot in base_range
            ):
                filtered.append(e.current_start_slot)
            if filtered:
                filtered = sorted(set(filtered))
            base_range = filtered

        starts = base_range

        # si no puede solaparse, remover choque con fijos
        if not e.overlap and fixed_blocking:
            starts = remove_conflicting_starts(starts, e.duration_slots, fixed_blocking, buffer_for_event)

        # respetar disponibilidad: intentar restringir SOLO a preferidos si hay opción
        starts = filter_to_preferred_if_possible(starts, e.duration_slots)

        # Orden simple por inicio
        starts.sort()
        starts = reduce_candidates(e.priority, starts, k=300)

        # Precalcular costos (el costo de "offpref" sigue presente, por si no hubo opción preferida)
        for s in starts:
            dist_cost = max(0, s - now_slot) * int(dist_w[e.priority])
            offpref_slots = count_offpref_slots(s, e.duration_slots, preferred_slots)
            offpref_cost = offpref_slots * int(offpref_w[e.priority])
            cross_cost = int(crossday_w[e.priority]) if crosses_day(s, e.duration_slots, horizon) else 0
            move_cost = 0
            if e.current_start_slot is not None:
                move_cost = 0 if s == e.current_start_slot else int(move_w[e.priority])
            total = dist_cost + offpref_cost + cross_cost + move_cost
            costs[(e.id, s)] = Costs(
                total=total,
                dist=dist_cost,
                offpref=offpref_cost,
                crossday=cross_cost,
                movecost=move_cost
            )

        candidates[e.id] = starts

    # Si algún evento quedó sin candidatos, márcalo unplaced
    immediate_unplaced = [{"id": ev.id, "reason": "NoFeasibleCandidates"} for ev in flex if not candidates.get(ev.id)]
    flex = [ev for ev in flex if candidates.get(ev.id)]

    # Construcción del modelo CP-SAT
    model = cp_model.CpModel()

    x_vars: Dict[Tuple[str, int], cp_model.IntVar] = {}
    intervals_to_block: List[cp_model.IntervalVar] = []

    # Variables y constraint de "exactly one" por evento
    for ev in flex:
        xs = []
        for s in candidates[ev.id]:
            v = model.NewBoolVar(f"x_{ev.id}_{s}")
            x_vars[(ev.id, s)] = v
            xs.append(v)
            # Intervalo opcional para no-overlap
            if not ev.overlap:
                extra = buffer_slots if not ev.overlap else 0
                start = s
                duration = ev.duration_slots + extra
                end = s + duration
                intervals_to_block.append(
                    model.NewOptionalIntervalVar(start, duration, end, v, f"I_{ev.id}_{s}")
                )
        model.Add(sum(xs) == 1)  # exactly-one

    # Intervalos fijos que bloquean
    for f in fixed_blocking:
        iv = model.NewIntervalVar(
            f.start_slot,
            f.end_slot - f.start_slot,
            f.end_slot,
            f"F_{f.id}"
        )
        intervals_to_block.append(iv)

    # NoOverlap para los que bloquean capacidad
    if intervals_to_block:
        model.AddNoOverlap(intervals_to_block)

    # Objetivo
    obj_terms = []
    for ev in flex:
        for s in candidates[ev.id]:
            c = costs[(ev.id, s)].total
            if c != 0:
                obj_terms.append(c * x_vars[(ev.id, s)])
    model.Minimize(sum(obj_terms) if obj_terms else 0)

    # Resolver
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)

    placed = []
    moved = []
    unplaced = list(immediate_unplaced)
    score = None

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        total_cost = 0
        for ev in flex:
            chosen_s = None
            for s in candidates[ev.id]:
                if solver.Value(x_vars[(ev.id, s)]) == 1:
                    chosen_s = s
                    total_cost += costs[(ev.id, s)].total
                    break
            if chosen_s is None:
                unplaced.append({"id": ev.id, "reason": "NoChosenStart"})
            else:
                start_dt = horizon.slot_to_dt(chosen_s)
                end_dt = horizon.slot_to_dt(chosen_s + ev.duration_slots)
                placed.append({
                    "id": ev.id,
                    "start": start_dt.isoformat(),
                    "end": end_dt.isoformat()
                })
                if ev.current_start_slot is not None and ev.current_start_slot != chosen_s:
                    moved.append({
                        "id": ev.id,
                        "fromStart": horizon.slot_to_dt(ev.current_start_slot).isoformat(),
                        "toStart": start_dt.isoformat(),
                        "reason": "RepositionedByPolicy"
                    })
        score = int(total_cost)
        diag = {
            "hardConflicts": [],
            "summary": f"Placed {len(placed)}, moved {len(moved)}, unplaced {len(unplaced)}"
        }
        return {"placed": placed, "moved": moved, "unplaced": unplaced, "score": score, "diagnostics": diag}

    diag = {"hardConflicts": ["Infeasible model"], "summary": "No solution"}
    return {"placed": [], "moved": [], "unplaced": unplaced, "score": None, "diagnostics": diag}


# -----------------------------
# CLI
# -----------------------------

def main():
    ap = argparse.ArgumentParser(description="Agenda Inteligente - Solver CSP")
    ap.add_argument("json", nargs="?", help="Ruta del archivo JSON de entrada (si no, lee stdin)")
    args = ap.parse_args()

    if args.json:
        with open(args.json, "r", encoding="utf-8") as f:
            payload = json.load(f)
    else:
        payload = json.load(sys.stdin)

    result = solve_schedule(payload)
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
