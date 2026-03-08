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
from typing import Any, Dict, List, Tuple, Set
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ortools.sat.python import cp_model

from solver_common import (
    Horizon,
    parse_iso_localized,
    parse_hhmm,
    safe_positive_int,
    FixedEvent,
    FlexibleEvent,
    Costs,
    expand_window_slots,
    remove_conflicting_starts,
    reduce_candidates,
    count_offpref_slots,
    crosses_day,
)


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

    # working_hours_slots: siempre calculado desde dayStart/dayEnd/activeDays.
    # Sirve como nivel intermedio de fallback cuando los slots preferidos están bloqueados.
    working_hours_slots: Set[int] = set()
    cur = horizon.start_dt
    while cur < horizon.end_dt:
        dow = cur.weekday()
        if dow in allowed_days:
            a = cur.replace(hour=day_start_tuple[0], minute=day_start_tuple[1], second=0, microsecond=0)
            b = cur.replace(hour=day_end_tuple[0], minute=day_end_tuple[1], second=0, microsecond=0)
            if b <= a:
                a = cur.replace(hour=0, minute=0, second=0, microsecond=0)
                b = (a + timedelta(days=1))
            working_hours_slots.update(horizon.slots_in_interval(a, b))
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

    # Helper: filtrar candidatos usando 3 niveles de fallback:
    #   Nivel 1 — slots dentro de preferencia del usuario (horario ideal)
    #   Nivel 2 — slots dentro de horario laboral (dayStart-dayEnd)
    #   Nivel 3 — cualquier slot disponible (sin restricción de horario)
    # Esto garantiza que eventos SIEMPRE tengan candidatos mientras haya slots libres.
    def filter_to_preferred_if_possible(starts: List[int], dur: int, require: bool = False) -> List[int]:
        def fits_set(s: int, slot_set: Set[int]) -> bool:
            return all(t in slot_set for t in range(s, s + dur))

        # Nivel 1: slots preferidos del usuario
        if preferred_slots:
            pref = [s for s in starts if fits_set(s, preferred_slots)]
            if pref:
                return pref

        # Nivel 2: horario laboral (fallback intermedio)
        if working_hours_slots:
            work = [s for s in starts if fits_set(s, working_hours_slots)]
            if work:
                return work

        # Nivel 3: cualquier slot (no filtrar)
        return starts

    # Helper: filtrar días deshabilitados — verifica TODOS los días que ocupa el evento
    def filter_allowed_days(starts: List[int], dur: int) -> List[int]:
        if len(allowed_days) >= 7:
            return starts
        out = []
        for s in starts:
            day_set = {horizon.slot_to_dt(t).weekday() for t in range(s, s + dur)}
            if day_set.issubset(allowed_days):
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
        if e.priority in ("UnI", "InU"):
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

        # Primero remover conflictos con fijos (el dominio real factible).
        # Luego filtrar por preferencia sobre los candidatos ya factibles.
        # Este orden es crítico: si se aplica el filtro de preferencia antes,
        # se puede acabar con un subconjunto de slots que después quedan todos
        # bloqueados por eventos fijos, resultando en dominio vacío.
        if not e.overlap and fixed_blocking:
            starts = remove_conflicting_starts(starts, e.duration_slots, fixed_blocking, buffer_for_event)

        # Preferencia con fallback de 3 niveles: preferidos → horario laboral → cualquier slot.
        starts = filter_to_preferred_if_possible(starts, e.duration_slots)

        # Calcular costos para TODOS los candidatos antes de truncar.
        # Así la reducción a k=300 preserva los candidatos de MENOR COSTO,
        # no solo los temporalmente más cercanos.
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

        # Ordenar por costo ascendente y conservar los k mejores candidatos.
        starts.sort(key=lambda s: (costs[(e.id, s)].total, s))
        starts = starts[:300]

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

    # Resolver — timeout adaptativo según tamaño del problema
    num_vars = sum(len(candidates[ev.id]) for ev in flex)
    time_limit = min(30.0, 5.0 + 0.2 * len(flex) + 0.001 * num_vars)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
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

    # No hay solución: distinguir entre infactible y timeout
    if status == cp_model.INFEASIBLE:
        diag = {"hardConflicts": ["Infeasible model"], "summary": "INFEASIBLE: sin solución posible"}
    else:
        diag = {"hardConflicts": [], "summary": "TIMEOUT: solver no encontró solución en el tiempo límite"}
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
