"""Modelos de datos del solver.

Dataclasses tipadas para entrada, salida, y estructuras intermedias.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple
from enum import Enum
from zoneinfo import ZoneInfo


class EventPriority(str, Enum):
    """Prioridad de un evento flexible en el solver."""
    URGENT = "UnI"
    RELEVANT = "InU"


class WindowType(str, Enum):
    """Tipo de ventana de disponibilidad de un evento."""
    PRONTO = "PRONTO"
    SEMANA = "SEMANA"
    MES = "MES"
    RANGO = "RANGO"
    NONE = "NONE"


@dataclass(frozen=True)
class CategoryInfo:
    """Categoría del usuario con su posición ordinal."""
    name: str
    rank: int  # 1 = máxima prioridad


@dataclass(frozen=True)
class Horizon:
    """Ventana temporal del solver discretizada en slots."""
    start_dt: datetime
    end_dt: datetime
    slot_minutes: int
    total_slots: int
    tz_name: str

    @property
    def tz(self) -> ZoneInfo:
        """Zona horaria como objeto ZoneInfo."""
        return ZoneInfo(self.tz_name)

    @property
    def slot_delta(self) -> timedelta:
        """Duración de un slot como timedelta."""
        return timedelta(minutes=self.slot_minutes)

    def dt_to_slot(self, dt: datetime) -> int:
        """Convierte un datetime al índice de slot (redondea hacia abajo).

        Args:
            dt: Datetime con o sin zona horaria.

        Returns:
            Índice de slot (puede ser negativo si dt < start_dt).
        """
        tz = self.tz
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz)
        dt = dt.astimezone(tz)
        diff = dt - self.start_dt
        slots = diff.total_seconds() / (self.slot_minutes * 60)
        return int(math.floor(slots))

    def dt_to_next_slot(self, dt: datetime) -> int:
        """Convierte un datetime al índice de slot (redondea hacia arriba).

        Args:
            dt: Datetime con o sin zona horaria.

        Returns:
            Índice de slot redondeado al siguiente si dt no cae exactamente.
        """
        base = self.dt_to_slot(dt)
        if self.slot_to_dt(base) < dt:
            return base + 1
        return base

    def slot_to_dt(self, s: int) -> datetime:
        """Convierte un índice de slot al datetime correspondiente.

        Args:
            s: Índice de slot.

        Returns:
            Datetime en la zona horaria del horizonte.
        """
        return self.start_dt + s * self.slot_delta

    def slots_in_interval(self, a: datetime, b: datetime) -> range:
        """Slots [sa, sb) que cubren el intervalo [a, b).

        Args:
            a: Inicio del intervalo.
            b: Fin del intervalo.

        Returns:
            range de índices de slot dentro del horizonte.
        """
        sa = self.dt_to_slot(a)
        sb = self.dt_to_slot(b)
        if self.slot_to_dt(sb) < b:
            sb += 1
        sa = max(sa, 0)
        sb = min(sb, self.total_slots)
        return range(sa, sb)


@dataclass(frozen=True)
class FixedEvent:
    """Evento fijo (crítico, pinned, o bloque fantasma). No participa en optimización."""
    id: str
    start_slot: int
    end_slot: int
    blocks_capacity: bool


@dataclass(frozen=True)
class FlexibleEvent:
    """Evento flexible que el solver debe posicionar."""
    id: str
    priority: EventPriority
    duration_slots: int
    can_overlap: bool
    current_start_slot: Optional[int]
    window_type: WindowType
    window_start_slot: Optional[int]
    window_end_slot: Optional[int]
    category_rank: int  # posición ordinal de su categoría (1 = max)


@dataclass(frozen=True)
class CandidateCost:
    """Costo desglosado de un candidato (evento, slot)."""
    total: int
    move: int
    distance: int
    off_preference: int
    cross_day: int


@dataclass
class SolverConfig:
    """Configuración global del solver."""
    buffer_slots: int
    lead_time_slot: int  # primer slot válido (now + lead_time)
    categories: List[CategoryInfo]
    total_categories: int
    timeout_seconds: float = 5.0
    gap_limit: float = 0.05
    max_candidates_per_event: int = 150
    max_flexible_events: int = 60


# --- Modelos de SALIDA ---

@dataclass
class PlacedEvent:
    """Evento colocado exitosamente por el solver."""
    id: str
    start_iso: str
    end_iso: str


@dataclass
class MovedEvent:
    """Evento que el solver movió de su posición original."""
    id: str
    from_start_iso: Optional[str]
    to_start_iso: str
    reason: str


@dataclass
class UnplacedEvent:
    """Evento que el solver no pudo colocar."""
    id: str
    reason: str


@dataclass
class SolverDiagnostics:
    """Información de diagnóstico del resultado del solver."""
    hard_conflicts: List[str]
    summary: str


@dataclass
class SolverResult:
    """Resultado completo del solver."""
    placed: List[PlacedEvent]
    moved: List[MovedEvent]
    unplaced: List[UnplacedEvent]
    score: Optional[int]
    diagnostics: SolverDiagnostics

    def to_dict(self) -> Dict:
        """Serializa a diccionario para JSON output."""
        return {
            "placed": [{"id": p.id, "start": p.start_iso, "end": p.end_iso} for p in self.placed],
            "moved": [
                {"id": m.id, "fromStart": m.from_start_iso, "toStart": m.to_start_iso, "reason": m.reason}
                for m in self.moved
            ],
            "unplaced": [{"id": u.id, "reason": u.reason} for u in self.unplaced],
            "score": self.score,
            "diagnostics": {
                "hardConflicts": self.diagnostics.hard_conflicts,
                "summary": self.diagnostics.summary,
            },
        }


def build_horizon(start_dt: datetime, end_dt: datetime, slot_minutes: int, tz_name: str) -> Horizon:
    """Construye un Horizon calculando total_slots automáticamente.

    Args:
        start_dt: Datetime de inicio del horizonte.
        end_dt: Datetime de fin del horizonte.
        slot_minutes: Duración de cada slot en minutos.
        tz_name: Nombre de la zona horaria IANA.

    Returns:
        Horizonte con total_slots calculado.
    """
    total_slots = math.ceil((end_dt - start_dt).total_seconds() / (slot_minutes * 60))
    return Horizon(
        start_dt=start_dt,
        end_dt=end_dt,
        slot_minutes=slot_minutes,
        total_slots=total_slots,
        tz_name=tz_name,
    )
