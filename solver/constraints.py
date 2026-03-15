"""Construcción de restricciones CP-SAT para el modelo de agendamiento.

Cada función recibe el modelo CP-SAT y lo modifica in-place.
Las restricciones asumen que los candidatos ya están filtrados.
"""
from __future__ import annotations

from typing import Dict, List, Tuple

from ortools.sat.python import cp_model

from .models import CandidateCost, EventPriority, FixedEvent, FlexibleEvent


def add_exactly_one_constraints(
    model: cp_model.CpModel,
    x_vars: Dict[str, List[Tuple[int, cp_model.IntVar]]],
) -> None:
    """Restricción R: para cada evento, exactamente un candidato es elegido.

    Agrega al modelo la restricción sum(x_{e,s}) == 1 para cada evento e,
    garantizando que el solver asigne exactamente un slot por evento.

    Args:
        model: Modelo CP-SAT a modificar.
        x_vars: Diccionario event_id → [(slot, bool_var), ...] con todas
                las variables booleanas del evento.
    """
    for event_id, slot_vars in x_vars.items():
        bool_vars = [v for _, v in slot_vars]
        model.Add(sum(bool_vars) == 1)


def add_no_overlap_constraint(
    model: cp_model.CpModel,
    intervals: List[cp_model.IntervalVar],
) -> None:
    """Restricción R1: no solapamiento entre eventos que bloquean capacidad.

    Agrega AddNoOverlap al modelo con todos los intervalos que bloquean
    capacidad (flexibles no-overlap + fijos bloqueantes).

    Args:
        model: Modelo CP-SAT a modificar.
        intervals: Lista de IntervalVar que deben no solaparse.
    """
    if intervals:
        model.AddNoOverlap(intervals)


def create_interval_vars(
    model: cp_model.CpModel,
    event_id: str,
    candidates: List[int],
    x_vars: Dict[Tuple[str, int], cp_model.IntVar],
    duration_slots: int,
    buffer_slots: int,
    can_overlap: bool,
) -> List[cp_model.IntervalVar]:
    """Crea IntervalVar opcionales para cada candidato de un evento flexible.

    Solo crea intervalos si can_overlap=False; si el evento puede solaparse,
    no participa en la restricción AddNoOverlap y se retorna lista vacía.

    El tamaño de cada intervalo es duration_slots + buffer_slots para garantizar
    separación entre eventos consecutivos.

    Los nombres de variables siguen el patrón I_{event_id}_{slot} para debug.

    Args:
        model: Modelo CP-SAT a modificar.
        event_id: Identificador del evento.
        candidates: Lista de slots candidatos del evento.
        x_vars: Diccionario (event_id, slot) → bool_var con las variables de decisión.
        duration_slots: Duración del evento en slots.
        buffer_slots: Buffer de separación en slots.
        can_overlap: Si True, el evento puede solaparse y no se crean intervalos.

    Returns:
        Lista de IntervalVar opcionales (vacía si can_overlap=True).
    """
    if can_overlap:
        return []

    intervals: List[cp_model.IntervalVar] = []
    interval_duration = duration_slots + buffer_slots

    for s in candidates:
        bool_var = x_vars[(event_id, s)]
        iv = model.NewOptionalIntervalVar(
            start=s,
            size=interval_duration,
            end=s + interval_duration,
            is_present=bool_var,
            name=f"I_{event_id}_{s}",
        )
        intervals.append(iv)

    return intervals


def create_fixed_intervals(
    model: cp_model.CpModel,
    fixed_events: List[FixedEvent],
) -> List[cp_model.IntervalVar]:
    """Crea IntervalVar fijos (no opcionales) para eventos críticos/pinned/fantasma.

    Solo crea intervalos para los eventos que bloquean capacidad
    (FixedEvent.blocks_capacity == True).

    Los nombres siguen el patrón F_{event_id} para debug.

    Args:
        model: Modelo CP-SAT a modificar.
        fixed_events: Lista de eventos fijos del solver.

    Returns:
        Lista de IntervalVar fijos que participan en AddNoOverlap.
    """
    intervals: List[cp_model.IntervalVar] = []

    for f in fixed_events:
        if not f.blocks_capacity:
            continue
        iv = model.NewIntervalVar(
            start=f.start_slot,
            size=f.end_slot - f.start_slot,
            end=f.end_slot,
            name=f"F_{f.id}",
        )
        intervals.append(iv)

    return intervals


def build_objective(
    model: cp_model.CpModel,
    flex_events: List[FlexibleEvent],
    x_vars: Dict[Tuple[str, int], cp_model.IntVar],
    costs: Dict[Tuple[str, int], CandidateCost],
    candidates: Dict[str, List[int]],
) -> None:
    """Construye la función objetivo: minimizar suma de costos ponderados.

    Para cada evento e y cada candidato s, agrega el término:
        cost(e, s).total × x_{e,s}

    al objetivo de minimización del modelo CP-SAT.

    Args:
        model: Modelo CP-SAT a modificar.
        flex_events: Lista de eventos flexibles que participan en el solver.
        x_vars: Diccionario (event_id, slot) → bool_var con las variables de decisión.
        costs: Diccionario (event_id, slot) → CandidateCost con los costos calculados.
        candidates: Diccionario event_id → lista de slots candidatos.
    """
    obj_terms = []
    prio_weights = {EventPriority.URGENT: 3, EventPriority.RELEVANT: 1}
    for ev in flex_events:
        pw = prio_weights.get(ev.priority, 1)
        for s in candidates.get(ev.id, []):
            c = costs[(ev.id, s)].total
            if c != 0:
                obj_terms.append(c * x_vars[(ev.id, s)])
            else:
                # Tie-breaker when primary cost is 0 (new events or flexible mode):
                # prefer placing higher-priority events at earlier slots.
                # URGENT (pw=3) gets 3× more pressure toward early slots than RELEVANT (pw=1).
                pos_term = pw * s
                if pos_term != 0:
                    obj_terms.append(pos_term * x_vars[(ev.id, s)])

    model.Minimize(sum(obj_terms) if obj_terms else 0)
