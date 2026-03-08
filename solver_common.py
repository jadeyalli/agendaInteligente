#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
solver_common.py
-----------------
Utilidades compartidas entre solver.py y solver_debug.py.

Incluye:
- Clase Horizon (manejo de slots de tiempo)
- Funciones de parsing de fechas y configuración
- Dataclasses: FixedEvent, FlexibleEvent, Costs
- Funciones de candidatos y costos
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, Tuple
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


# =============================
# Utilidades de tiempo / slots
# =============================

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
        return range(sa, sb)

    @property
    def total_slots(self) -> int:
        diff = self.end_dt - self.start_dt
        return math.ceil(diff.total_seconds() / (self.slot_minutes * 60))


def parse_iso_localized(s: str, tz: ZoneInfo) -> datetime:
    # Acepta ISO con o sin tz; si no trae tz, asumir tz del usuario
    dt = datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None
    if dt is None:
        raise ValueError(f"Fecha inválida: {s!r}")
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


# =============================
# Estructuras de eventos
# =============================

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


# =============================
# Generación de candidatos
# =============================

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
            next_month = start.replace(year=start.year + 1, month=1, day=1,
                                       hour=0, minute=0, second=0, microsecond=0)
        else:
            next_month = start.replace(month=start.month + 1, day=1,
                                       hour=0, minute=0, second=0, microsecond=0)
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


def reduce_candidates(priority: str, starts: List[int], k: int = 300) -> List[int]:
    """
    Para performance: limitamos candidatos.
    - UnI: prioriza los más tempranos.
    - InU: similar.
    """
    return starts[:k]


# =============================
# Costos
# =============================

def count_offpref_slots(s: int, dur: int, preferred_set: Set[int]) -> int:
    return sum(1 for t in range(s, s + dur) if t not in preferred_set)


def crosses_day(s: int, dur: int, horizon: Horizon) -> int:
    if dur <= 0:
        return 0
    d1 = day_index(horizon.slot_to_dt(s))
    d2 = day_index(horizon.slot_to_dt(s + dur - 1))
    return 0 if d1 == d2 else 1
