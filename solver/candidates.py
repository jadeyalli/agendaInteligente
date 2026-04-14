"""Generación de candidatos y cálculo de costos para eventos flexibles.

Cada función es pura: recibe datos, retorna datos. Sin estado mutable externo.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple

from .models import (
    CandidateCost,
    EventPriority,
    FixedEvent,
    FlexibleEvent,
    Horizon,
    SolverConfig,
    WindowType,
)

# Pesos por prioridad según el modelo formal (sección 4.4 del doc técnico v3)
_PRIORITY_WEIGHT: Dict[EventPriority, int] = {
    EventPriority.URGENT: 3,
    EventPriority.RELEVANT: 1,
}


def expand_window_slots(event: FlexibleEvent, horizon: Horizon, now_slot: int) -> List[int]:
    """Genera todos los slots posibles dentro de la ventana del evento.

    Traduce el tipo de ventana (PRONTO, SEMANA, MES, RANGO, NONE) a una lista
    de slots de inicio candidatos dentro del horizonte.

    Args:
        event: Evento flexible con su tipo de ventana configurado.
        horizon: Horizonte temporal del solver.
        now_slot: Slot correspondiente al momento actual.

    Returns:
        Lista de slots de inicio candidatos sin filtrar.
    """
    wt = event.window_type

    if wt == WindowType.PRONTO:
        a = max(now_slot, 0)
        b = min(now_slot + math.ceil((48 * 60) / horizon.slot_minutes), horizon.total_slots)
        return list(range(a, b))

    if wt == WindowType.SEMANA:
        start = horizon.start_dt
        weekday = start.isoweekday()  # 1=lun .. 7=dom
        monday = start - timedelta(days=weekday - 1)
        monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
        sunday_end = monday + timedelta(days=7)
        a = max(horizon.dt_to_slot(monday), 0)
        b = min(horizon.dt_to_slot(sunday_end), horizon.total_slots)
        return list(range(a, b))

    if wt == WindowType.MES:
        start = horizon.start_dt
        month_start = start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if start.month == 12:
            next_month = start.replace(year=start.year + 1, month=1, day=1,
                                       hour=0, minute=0, second=0, microsecond=0)
        else:
            next_month = start.replace(month=start.month + 1, day=1,
                                       hour=0, minute=0, second=0, microsecond=0)
        a = max(horizon.dt_to_slot(month_start), 0)
        b = min(horizon.dt_to_slot(next_month), horizon.total_slots)
        return list(range(a, b))

    if wt == WindowType.RANGO:
        if event.window_start_slot is None or event.window_end_slot is None:
            return []
        a = max(int(event.window_start_slot), 0)
        b = min(int(event.window_end_slot), horizon.total_slots)
        return list(range(a, b))

    # WindowType.NONE o cualquier otro: todo el horizonte
    return list(range(0, horizon.total_slots))


def filter_by_enabled_days(
    starts: List[int],
    duration_slots: int,
    horizon: Horizon,
    allowed_days: Set[int],
) -> List[int]:
    """Filtra candidatos cuyos días estén todos habilitados.

    Verifica que TODOS los slots que ocupa el evento pertenezcan a días
    permitidos (0=lun .. 6=dom en weekday() de Python).

    Args:
        starts: Lista de slots de inicio candidatos.
        duration_slots: Duración del evento en slots.
        horizon: Horizonte temporal del solver.
        allowed_days: Conjunto de días de la semana habilitados (0=lun..6=dom).

    Returns:
        Lista filtrada de slots donde todos los días del evento están habilitados.
    """
    if len(allowed_days) >= 7:
        return starts
    out = []
    for s in starts:
        day_set = {horizon.slot_to_dt(t).weekday() for t in range(s, s + duration_slots)}
        if day_set.issubset(allowed_days):
            out.append(s)
    return out


def filter_by_lead_time(
    starts: List[int],
    now_slot: int,
    current_start_slot: Optional[int],
) -> List[int]:
    """Filtra candidatos que respeten la antelación mínima.

    Elimina slots que estén antes del momento actual + lead_time.
    Excepción: si el evento ya estaba programado antes del límite, se permite
    mantenerlo en su posición actual.

    Args:
        starts: Lista de slots de inicio candidatos.
        now_slot: Primer slot válido (now + lead_time ya aplicado).
        current_start_slot: Slot actual del evento si era movable, None si es nuevo.

    Returns:
        Lista filtrada de slots que respetan la antelación mínima.
    """
    filtered = [s for s in starts if s >= now_slot]

    if (
        current_start_slot is not None
        and current_start_slot < now_slot
        and current_start_slot in starts
    ):
        filtered.append(current_start_slot)

    if filtered:
        filtered = sorted(set(filtered))
    return filtered


def remove_conflicting_with_fixed(
    starts: List[int],
    duration_slots: int,
    fixed: List[FixedEvent],
    buffer_slots: int,
) -> List[int]:
    """Elimina candidatos que se solapan con eventos fijos que bloquean capacidad.

    Un candidato es conflictivo si el intervalo [s, s+duration+buffer) se solapa
    con [f.start_slot, f.end_slot+buffer) de cualquier evento fijo que bloquea.

    Args:
        starts: Lista de slots de inicio candidatos.
        duration_slots: Duración del evento en slots.
        fixed: Lista de eventos fijos.
        buffer_slots: Buffer de separación entre eventos en slots.

    Returns:
        Lista de slots sin conflicto con eventos fijos.
    """
    if not fixed:
        return starts
    out = []
    for s in starts:
        event_end = s + duration_slots
        conflict = False
        for f in fixed:
            if not f.blocks_capacity:
                continue
            if not (
                event_end + buffer_slots <= f.start_slot
                or s >= f.end_slot + buffer_slots
            ):
                conflict = True
                break
        if not conflict:
            out.append(s)
    return out


def filter_by_preference(
    starts: List[int],
    duration_slots: int,
    preferred_slots: Set[int],
    working_slots: Set[int],
) -> List[int]:
    """Filtro de 3 niveles: preferido → horario laboral → cualquier slot.

    Nivel 1: slots donde todos los slots del evento están en preferred_slots.
    Nivel 2 (fallback): slots donde todos los slots están en working_slots.
    Nivel 3 (fallback): cualquier slot disponible (sin restricción de horario).

    Garantiza que los eventos siempre tengan candidatos mientras haya slots libres.

    Args:
        starts: Lista de slots candidatos factibles.
        duration_slots: Duración del evento en slots.
        preferred_slots: Slots en horario preferido del usuario.
        working_slots: Slots en horario laboral configurado (dayStart-dayEnd).

    Returns:
        Lista filtrada según el nivel de preferencia más alto disponible.
    """
    def all_in_set(s: int, slot_set: Set[int]) -> bool:
        """Retorna True si todos los slots del evento están en slot_set."""
        return all(t in slot_set for t in range(s, s + duration_slots))

    if preferred_slots:
        pref = [s for s in starts if all_in_set(s, preferred_slots)]
        if pref:
            return pref

    if working_slots:
        work = [s for s in starts if all_in_set(s, working_slots)]
        if work:
            return work

    return starts


def calculate_cost(
    event: FlexibleEvent,
    start_slot: int,
    now_slot: int,
    config: SolverConfig,
    preferred_slots: Set[int],
    horizon: Horizon,
) -> CandidateCost:
    """Calcula el costo de asignar un evento a un slot específico.

    La función objetivo formal es:
        total = stability_mult × priority_weight × cat_weight × move

    Donde:
        stability_mult = {flexible: 0, balanced: 1, fixed: 10}
        priority_weight = {urgent: 3, relevant: 1}
        cat_weight = total_categories - cat_rank + 1
        move = |start - original_start| (0 si no tenía posición previa)

    Los campos adicionales (distance, off_preference, cross_day) se calculan
    para ordenar candidatos cuando total = 0 (modo flexible) y para diagnóstico.

    Args:
        event: Evento flexible a evaluar.
        start_slot: Slot de inicio candidato.
        now_slot: Slot correspondiente al momento actual.
        config: Configuración global del solver.
        preferred_slots: Slots en horario preferido del usuario.
        horizon: Horizonte temporal del solver.

    Returns:
        CandidateCost con el desglose de todos los componentes de costo.
    """
    stability_mult = 1  # solo modo balanceado
    priority_weight = _PRIORITY_WEIGHT[event.priority]
    cat_weight = config.total_categories - event.category_rank + 1

    move = 0
    if event.current_start_slot is not None:
        move = abs(start_slot - event.current_start_slot)

    total = stability_mult * priority_weight * cat_weight * move

    # Componentes auxiliares para ordenamiento de candidatos y diagnóstico
    distance = max(0, start_slot - now_slot)

    off_preference = sum(
        1 for t in range(start_slot, start_slot + event.duration_slots)
        if t not in preferred_slots
    )

    cross_day = _crosses_day(start_slot, event.duration_slots, horizon)

    return CandidateCost(
        total=total,
        move=move,
        distance=distance,
        off_preference=off_preference,
        cross_day=cross_day,
    )


def generate_candidates(
    event: FlexibleEvent,
    horizon: Horizon,
    config: SolverConfig,
    fixed_blocking: List[FixedEvent],
    now_slot: int,
    preferred_slots: Set[int],
    working_slots: Set[int],
    allowed_days: Set[int],
) -> Tuple[List[int], Dict[int, CandidateCost]]:
    """Pipeline completo de generación de candidatos para un evento.

    Ejecuta en orden:
        1. expand_window_slots — genera todos los slots de la ventana
        2. filter_by_enabled_days — respeta días activos del usuario
        3. filter_by_lead_time — respeta antelación mínima
        4. remove_conflicting_with_fixed — elimina conflictos con fijos
        5. filter_by_preference — aplica filtro de 3 niveles de preferencia
        6. calculate_cost para cada candidato — computa costos
        7. sort por (total, distance, off_preference) — ordena por costo
        8. truncar a config.max_candidates_per_event — limita a 150

    Args:
        event: Evento flexible a procesar.
        horizon: Horizonte temporal del solver.
        config: Configuración global con buffer_slots, stability, etc.
        fixed_blocking: Eventos fijos que bloquean capacidad.
        now_slot: Slot correspondiente a now + lead_time.
        preferred_slots: Slots en horario preferido del usuario.
        working_slots: Slots en horario laboral configurado.
        allowed_days: Días de la semana habilitados (0=lun..6=dom).

    Returns:
        Tupla de (lista de slots ordenados por costo, diccionario slot→costo).
        Lista vacía si no hay candidatos factibles.
    """
    buffer_for_event = config.buffer_slots if not event.can_overlap else 0

    # 1. Expandir ventana
    starts = expand_window_slots(event, horizon, now_slot)

    # Asegurar que el evento quepa completo dentro del horizonte
    latest_start = horizon.total_slots - (event.duration_slots + buffer_for_event)
    if latest_start < 0:
        return [], {}
    starts = [s for s in starts if 0 <= s <= latest_start]

    # 2. Filtrar días habilitados
    starts = filter_by_enabled_days(starts, event.duration_slots, horizon, allowed_days)

    # 3. Filtrar por antelación mínima
    starts = filter_by_lead_time(starts, now_slot, event.current_start_slot)

    # 4. Eliminar conflictos con fijos
    # IMPORTANTE: este filtro va ANTES del de preferencia para no reducir el dominio
    # a un subconjunto que luego quede completamente bloqueado por eventos fijos.
    if not event.can_overlap and fixed_blocking:
        starts = remove_conflicting_with_fixed(starts, event.duration_slots, fixed_blocking, buffer_for_event)

    # 5. Filtrar por preferencia con fallback de 3 niveles
    starts = filter_by_preference(starts, event.duration_slots, preferred_slots, working_slots)

    if not starts:
        return [], {}

    # 6. Calcular costos para todos los candidatos
    cost_map: Dict[int, CandidateCost] = {}
    for s in starts:
        cost_map[s] = calculate_cost(event, s, now_slot, config, preferred_slots, horizon)

    # 7. Ordenar por (total, distance, off_preference) para desempatar en modo flexible
    starts.sort(key=lambda s: (cost_map[s].total, cost_map[s].distance, cost_map[s].off_preference))

    # 8. Truncar al máximo configurado
    starts = starts[: config.max_candidates_per_event]
    cost_map = {s: cost_map[s] for s in starts}

    return starts, cost_map


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _day_index(dt: datetime) -> Tuple[int, int, int]:
    """Retorna (año, mes, día) para detectar cambio de día."""
    dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return (dt.year, dt.month, dt.day)


def _crosses_day(start_slot: int, duration_slots: int, horizon: Horizon) -> int:
    """Retorna 1 si el evento abarca más de un día del calendario, 0 si no.

    Args:
        start_slot: Slot de inicio del evento.
        duration_slots: Duración del evento en slots.
        horizon: Horizonte temporal del solver.

    Returns:
        1 si el evento cruza medianoche, 0 si no.
    """
    if duration_slots <= 0:
        return 0
    d1 = _day_index(horizon.slot_to_dt(start_slot))
    d2 = _day_index(horizon.slot_to_dt(start_slot + duration_slots - 1))
    return 0 if d1 == d2 else 1
