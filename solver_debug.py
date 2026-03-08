#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
solver_debug.py
----------------
Herramienta de depuración para el solver CSP de Agenda Inteligente.

Uso:
    python solver_debug.py caso.json

- Llama a tu solver (solve_schedule(payload)).
- Reconstruye el horizonte, los eventos fijos y flexibles.
- Calcula para cada evento flexible:
    * Dominio de slots candidatos (inicio posible).
    * Costos por candidato.
    * Slot elegido por el solver.
- Imprime un resumen legible para usar en el apartado de pruebas.
"""

from __future__ import annotations

import sys
import json
import math
import argparse
from typing import Any, Dict, List, Tuple, Optional, Set
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

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

# 🔴 IMPORTANTE: ajusta este import al nombre de tu archivo del solver
# por ejemplo, si tu archivo se llama solver.py, usa: import solver as solver_csp
import solver as solver_csp # <= CAMBIA ESTO AL NOMBRE REAL


# =============================
# Reconstrucción de dominios
# =============================

def build_debug_info(payload: Dict[str, Any],
                     result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Reconstruye:
    - horizonte
    - disponibilidad preferente
    - eventos fijos
    - eventos flexibles
    - dominio y costos por candidato
    Marca además qué candidato fue elegido en la solución (placed).
    """
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

    # preferred slots: igual que en el solver
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

    # working_hours_slots: siempre calculado (nivel 2 de fallback de preferencia)
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

    # Fixed events (igual que en el solver)
    fixed_json = payload["events"].get("fixed", []) + payload["events"].get("newFixed", [])
    fixed: List[FixedEvent] = []
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

    # Pesos (igual que solver)
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

    # starts que bloquean capacidad
    fixed_blocking = [f for f in fixed if f.blocks_capacity]

    # Helpers internos

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

        # Nivel 3: cualquier slot
        return starts

    def filter_allowed_days(starts: List[int], dur: int) -> List[int]:
        if len(allowed_days) >= 7:
            return starts
        out = []
        for s in starts:
            day_set = {horizon.slot_to_dt(t).weekday() for t in range(s, s + dur)}
            if day_set.issubset(allowed_days):
                out.append(s)
        return out

    # Construcción de candidatos + costos por evento
    candidates: Dict[str, List[int]] = {}
    costs: Dict[Tuple[str, int], Costs] = {}

    for e in flex:
        base_range = list(expand_window_slots(e, horizon, now_slot))
        buffer_for_event = buffer_slots if not e.overlap else 0

        # asegurar que quepa completo: último inicio posible = end - dur
        latest_start = horizon.total_slots - (e.duration_slots + buffer_for_event)
        if latest_start < 0:
            candidates[e.id] = []
            continue
        base_range = [s for s in base_range if 0 <= s <= latest_start]

        # política de fines de semana
        base_range = filter_allowed_days(base_range, e.duration_slots)

        starts = base_range

        # Primero remover conflictos (dominio factible real), luego aplicar preferencia.
        if not e.overlap and fixed_blocking:
            starts = remove_conflicting_starts(starts, e.duration_slots, fixed_blocking, buffer_for_event)

        # Preferencia con fallback de 3 niveles: preferidos → horario laboral → cualquier slot.
        starts = filter_to_preferred_if_possible(starts, e.duration_slots)

        # Calcular costos para TODOS los candidatos antes de truncar (mirrors solver.py)
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

        # Ordenar por costo y conservar los 300 mejores candidatos
        starts.sort(key=lambda s: (costs[(e.id, s)].total, s))
        starts = starts[:300]

        candidates[e.id] = starts

    # Mapear la solución: qué slot se eligió por evento flexible
    chosen_slot_by_id: Dict[str, Optional[int]] = {}
    for item in result.get("placed", []):
        ev_id = item["id"]
        try:
            dt = parse_iso_localized(item["start"], tz)
            chosen_slot_by_id[ev_id] = horizon.dt_to_slot(dt)
        except Exception:
            chosen_slot_by_id[ev_id] = None

    # Armar estructura de depuración
    debug_events: Dict[str, Any] = {}
    for e in flex:
        ev_info = {
            "id": e.id,
            "priority": e.priority,
            "durationSlots": e.duration_slots,
            "window": e.window,
            "windowStartSlot": e.window_start,
            "windowEndSlot": e.window_end,
            "currentStartSlot": e.current_start_slot,
            "candidates": [],
            "chosenSlot": chosen_slot_by_id.get(e.id),
        }

        for s in candidates.get(e.id, []):
            c = costs[(e.id, s)]
            start_dt = horizon.slot_to_dt(s)
            end_dt = horizon.slot_to_dt(s + e.duration_slots)
            ev_info["candidates"].append({
                "slot": s,
                "startISO": start_dt.isoformat(),
                "endISO": end_dt.isoformat(),
                "totalCost": c.total,
                "breakdown": {
                    "distance": c.dist,
                    "offPreference": c.offpref,
                    "crossDay": c.crossday,
                    "move": c.movecost,
                },
                "selected": (s == ev_info["chosenSlot"]),
            })

        debug_events[e.id] = ev_info

    return {
        "horizon": {
            "startISO": horizon.start_dt.isoformat(),
            "endISO": horizon.end_dt.isoformat(),
            "slotMinutes": horizon.slot_minutes,
            "totalSlots": horizon.total_slots,
        },
        "preferredSlotsCount": len(preferred_slots),
        "fixedEvents": [
            {
                "id": f.id,
                "startSlot": f.start_slot,
                "endSlot": f.end_slot,
                "blocksCapacity": f.blocks_capacity,
            }
            for f in fixed
        ],
        "flexibleEvents": debug_events,
    }


# =============================
# Formato legible en consola (RESUMIDO)
# =============================

def pretty_print_debug(debug: Dict[str, Any], result: Dict[str, Any]) -> None:
    MAX_CANDIDATES_SHOWN = 5  # número máximo de slots a mostrar por evento

    print("=== HORIZONTE ===")
    h = debug["horizon"]
    print(f"  Inicio:   {h['startISO']}")
    print(f"  Fin:      {h['endISO']}")
    print(f"  Slot:     {h['slotMinutes']} minutos")
    print(f"  Slots totales: {h['totalSlots']}")
    print(f"  Slots preferentes: {debug['preferredSlotsCount']}")
    print()

    if debug["fixedEvents"]:
        print("=== EVENTOS FIJOS (bloquean capacidad) ===")
        for f in debug["fixedEvents"]:
            print(f"  - {f['id']} | slots [{f['startSlot']}, {f['endSlot']}) "
                  f"| blocksCapacity={f['blocksCapacity']}")
        print()
    else:
        print("=== Sin eventos fijos en este caso ===\n")

    print("=== EVENTOS FLEXIBLES (variables del CSP) ===")
    for ev_id, info in debug["flexibleEvents"].items():
        print(f"\n--- Evento {ev_id} ---")
        print(f"  Prioridad:        {info['priority']}")
        print(f"  Duración (slots): {info['durationSlots']}")
        print(f"  Ventana:          {info['window']} "
              f"(startSlot={info['windowStartSlot']}, endSlot={info['windowEndSlot']})")
        print(f"  Slot actual:      {info['currentStartSlot']}")
        print(f"  Slot elegido:     {info['chosenSlot']}")

        # Interpretación tipo "variable y dominio"
        print("  Variable de decisión:")
        print(f"    x_{ev_id}_s ∈ {{slots candidatos}}")

        print("  Dominio (candidatos, vista resumida):")
        cands = info["candidates"]
        total_cands = len(cands)

        if not cands:
            print("    (sin candidatos factibles; el solver no puede programar este evento)")
        else:
            # Elegimos algunos índices representativos:
            # - primeros
            # - últimos
            # - siempre el elegido, si existe
            indices = set()

            # primeros slots
            for i in range(min(2, total_cands)):
                indices.add(i)

            # últimos slots
            for i in range(max(0, total_cands - 2), total_cands):
                indices.add(i)

            # slot elegido (si hay)
            chosen_slot = info["chosenSlot"]
            if chosen_slot is not None:
                for i, cand in enumerate(cands):
                    if cand["slot"] == chosen_slot:
                        indices.add(i)
                        break

            # ordenamos índices finales
            shown_indices = sorted(indices)

            for i in shown_indices[:MAX_CANDIDATES_SHOWN]:
                cand = cands[i]
                flag = " <= ELEGIDO" if cand["selected"] else ""
                bd = cand["breakdown"]
                print(
                    f"    slot={cand['slot']} | {cand['startISO']} -> {cand['endISO']} "
                    f"| costo={cand['totalCost']} "
                    f"(dist={bd['distance']}, offPref={bd['offPreference']}, "
                    f"crossDay={bd['crossDay']}, move={bd['move']}){flag}"
                )

            # Si hay más candidatos de los que mostramos, indicamos cuántos se omitieron
            if total_cands > MAX_CANDIDATES_SHOWN:
                omitidos = total_cands - len(shown_indices[:MAX_CANDIDATES_SHOWN])
                if omitidos > 0:
                    print(f"    ... ({omitidos} candidatos adicionales omitidos)")

    print("\n=== RESUMEN DEL SOLVER ===")
    print(f"  placed:   {len(result.get('placed', []))}")
    print(f"  moved:    {len(result.get('moved', []))}")
    print(f"  unplaced: {len(result.get('unplaced', []))}")
    print(f"  score:    {result.get('score')}")
    diag = result.get("diagnostics", {})
    print(f"  diagnostics: {diag.get('summary')}")
    if diag.get("hardConflicts"):
        print("  hardConflicts:")
        for c in diag["hardConflicts"]:
            print(f"    - {c}")

# =============================
# CLI principal
# =============================

def main():
    ap = argparse.ArgumentParser(
        description="Depurador del solver CSP de Agenda Inteligente"
    )
    ap.add_argument(
        "json",
        nargs="?",
        help="Ruta del archivo JSON de entrada (si se omite, se lee de stdin)",
    )
    args = ap.parse_args()

    if args.json:
        with open(args.json, "r", encoding="utf-8") as f:
            payload = json.load(f)
    else:
        payload = json.load(sys.stdin)

    # Ejecutar solver "real"
    result = solver_csp.solve_schedule(payload)

    # Construir info de depuración
    debug = build_debug_info(payload, result)

    # Imprimir explicación legible
    pretty_print_debug(debug, result)


if __name__ == "__main__":
    main()
