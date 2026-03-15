"""Algoritmo fallback greedy para cuando el solver CP-SAT falla o excede el tiempo.

Coloca eventos por orden de prioridad × categoría en el primer slot libre.
Garantiza respuesta siempre, aunque subóptima.
"""
from __future__ import annotations

from typing import Dict, List, Set, Tuple

from .candidates import generate_candidates
from .models import (
    EventPriority,
    FixedEvent,
    FlexibleEvent,
    Horizon,
    MovedEvent,
    PlacedEvent,
    SolverConfig,
    SolverDiagnostics,
    SolverResult,
    UnplacedEvent,
)

_PRIORITY_WEIGHT: Dict[EventPriority, int] = {
    EventPriority.URGENT: 3,
    EventPriority.RELEVANT: 1,
}


def greedy_schedule(
    flex_events: List[FlexibleEvent],
    fixed_events: List[FixedEvent],
    horizon: Horizon,
    config: SolverConfig,
    preferred_slots: Set[int],
    working_slots: Set[int],
    allowed_days: Set[int],
    now_slot: int,
) -> SolverResult:
    """Coloca eventos por prioridad × categoría en el primer slot libre disponible.

    Algoritmo O(n × k) donde n = eventos, k = candidatos por evento:
        1. Ordenar flex_events por priority_weight DESC, cat_weight DESC.
        2. Para cada evento, generar candidatos con generate_candidates().
        3. Iterar candidatos en orden de costo; elegir el primero que no solape
           con eventos ya asignados ni con eventos fijos bloqueantes.
        4. Si no hay candidato válido, marcar el evento como unplaced.

    Args:
        flex_events: Eventos flexibles a posicionar.
        fixed_events: Eventos fijos (incluye los congelados por degradación).
        horizon: Horizonte temporal del solver.
        config: Configuración global del solver.
        preferred_slots: Slots en horario preferido del usuario.
        working_slots: Slots en horario laboral configurado.
        allowed_days: Días de la semana habilitados (0=lun..6=dom).
        now_slot: Slot correspondiente a now + lead_time.

    Returns:
        SolverResult con los eventos placed, moved y unplaced.
    """
    sorted_events = sorted(flex_events, key=_sort_key(config))

    # Intervalos ya ocupados: fijos bloqueantes + lo que el greedy va asignando
    occupied: List[Tuple[int, int]] = [
        (f.start_slot, f.end_slot)
        for f in fixed_events
        if f.blocks_capacity
    ]

    placed: List[PlacedEvent] = []
    moved: List[MovedEvent] = []
    unplaced: List[UnplacedEvent] = []

    for ev in sorted_events:
        slots, _ = generate_candidates(
            ev, horizon, config, fixed_events, now_slot,
            preferred_slots, working_slots, allowed_days,
        )

        assigned_slot = None
        for s in slots:
            if not ev.can_overlap and _overlaps_occupied(s, ev.duration_slots, config.buffer_slots, occupied):
                continue
            assigned_slot = s
            break

        if assigned_slot is None:
            unplaced.append(UnplacedEvent(id=ev.id, reason="NoFeasibleSlotInGreedy"))
            continue

        start_dt = horizon.slot_to_dt(assigned_slot)
        end_dt = horizon.slot_to_dt(assigned_slot + ev.duration_slots)

        placed.append(PlacedEvent(
            id=ev.id,
            start_iso=start_dt.isoformat(),
            end_iso=end_dt.isoformat(),
        ))

        if ev.current_start_slot is not None and ev.current_start_slot != assigned_slot:
            moved.append(MovedEvent(
                id=ev.id,
                from_start_iso=horizon.slot_to_dt(ev.current_start_slot).isoformat(),
                to_start_iso=start_dt.isoformat(),
                reason="GreedyFallbackRepositioned",
            ))

        if not ev.can_overlap:
            occupied.append((assigned_slot, assigned_slot + ev.duration_slots))

    return SolverResult(
        placed=placed,
        moved=moved,
        unplaced=unplaced,
        score=None,
        diagnostics=SolverDiagnostics(
            hard_conflicts=[],
            summary=f"Greedy fallback: placed {len(placed)}, moved {len(moved)}, unplaced {len(unplaced)}",
        ),
    )


def _sort_key(config: SolverConfig):
    """Retorna función de ordenamiento: priority_weight DESC, cat_weight DESC."""
    def key(ev: FlexibleEvent) -> Tuple[int, int]:
        priority_weight = _PRIORITY_WEIGHT[ev.priority]
        cat_weight = config.total_categories - ev.category_rank + 1
        return (-priority_weight, -cat_weight)
    return key


def _overlaps_occupied(
    start: int,
    duration: int,
    buffer: int,
    occupied: List[Tuple[int, int]],
) -> bool:
    """Verifica si el intervalo [start, start+duration) solapa con algún ocupado.

    Args:
        start: Slot de inicio del evento candidato.
        duration: Duración del evento en slots.
        buffer: Buffer de separación en slots.
        occupied: Lista de intervalos (start, end) ya asignados.

    Returns:
        True si hay solapamiento, False si el slot es libre.
    """
    end = start + duration
    for (os, oe) in occupied:
        if not (end + buffer <= os or start >= oe + buffer):
            return True
    return False
