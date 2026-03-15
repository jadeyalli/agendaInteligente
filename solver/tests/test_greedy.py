"""Tests para solver/greedy.py — algoritmo greedy fallback."""
from __future__ import annotations

import math
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from solver.greedy import greedy_schedule, _overlaps_occupied
from solver.models import (
    EventPriority,
    FixedEvent,
    FlexibleEvent,
    Horizon,
    SolverConfig,
    StabilityMode,
    WindowType,
    build_horizon,
)

TZ = "America/Mexico_City"
SLOT_MIN = 5


def _make_horizon(days: int = 7) -> Horizon:
    tz = ZoneInfo(TZ)
    start = datetime(2026, 10, 5, 0, 0, tzinfo=tz)
    end = datetime(2026, 10, 5 + days, 0, 0, tzinfo=tz)
    return build_horizon(start, end, SLOT_MIN, TZ)


def _make_event(
    *,
    id: str,
    priority: EventPriority = EventPriority.RELEVANT,
    duration_minutes: int = 60,
    can_overlap: bool = False,
    window_type: WindowType = WindowType.NONE,
    current_start_slot: int | None = None,
    category_rank: int = 1,
) -> FlexibleEvent:
    duration_slots = math.ceil(duration_minutes / SLOT_MIN)
    return FlexibleEvent(
        id=id,
        priority=priority,
        duration_slots=duration_slots,
        can_overlap=can_overlap,
        current_start_slot=current_start_slot,
        window_type=window_type,
        window_start_slot=None,
        window_end_slot=None,
        category_rank=category_rank,
    )


def _make_fixed(id: str, start_slot: int, end_slot: int, blocks: bool = True) -> FixedEvent:
    return FixedEvent(id=id, start_slot=start_slot, end_slot=end_slot, blocks_capacity=blocks)


def _make_config(stability: StabilityMode = StabilityMode.FLEXIBLE, total_cats: int = 2) -> SolverConfig:
    return SolverConfig(
        buffer_slots=1,
        lead_time_slot=0,
        stability=stability,
        categories=[],
        total_categories=total_cats,
    )


# ---------------------------------------------------------------------------
# _overlaps_occupied helper
# ---------------------------------------------------------------------------

class TestOverlapsOccupied:
    def test_no_occupied_never_overlaps(self):
        assert not _overlaps_occupied(10, 5, 0, [])

    def test_overlap_detected(self):
        occupied = [(10, 20)]
        assert _overlaps_occupied(15, 5, 0, occupied)

    def test_adjacent_no_overlap_without_buffer(self):
        occupied = [(10, 20)]
        assert not _overlaps_occupied(20, 5, 0, occupied)

    def test_buffer_creates_gap(self):
        occupied = [(10, 20)]
        # start=18, duration=2, end=20; with buffer=2: need end+buffer<=10 or start>=20+2
        # 20+2=22; 18>=22? No. 22<=10? No. Overlaps.
        assert _overlaps_occupied(18, 2, 2, occupied)

    def test_well_before_no_overlap(self):
        occupied = [(20, 30)]
        assert not _overlaps_occupied(0, 5, 0, occupied)


# ---------------------------------------------------------------------------
# greedy_schedule
# ---------------------------------------------------------------------------

class TestGreedySchedule:
    def test_single_event_gets_placed(self):
        h = _make_horizon()
        config = _make_config()
        ev = _make_event(id="ev1", duration_minutes=30)
        result = greedy_schedule([ev], [], h, config, set(), set(range(h.total_slots)), set(range(7)), 0)
        ids_placed = [p.id for p in result.placed]
        assert "ev1" in ids_placed
        assert result.unplaced == []

    def test_urgent_placed_before_relevant(self):
        h = _make_horizon()
        config = _make_config(total_cats=2)
        urgent = _make_event(id="urgent", priority=EventPriority.URGENT, category_rank=1)
        relevant = _make_event(id="relevant", priority=EventPriority.RELEVANT, category_rank=2)
        # Both compete for the same slots; urgent should get priority (sorted first)
        result = greedy_schedule([relevant, urgent], [], h, config,
                                 set(), set(range(h.total_slots)), set(range(7)), 0)
        placed_ids = [p.id for p in result.placed]
        assert "urgent" in placed_ids

    def test_fixed_blocker_respected(self):
        h = _make_horizon()
        config = _make_config()
        # Block the first 100 slots
        fixed = [_make_fixed("f1", 0, 100)]
        ev = _make_event(id="ev1", duration_minutes=30)
        result = greedy_schedule([ev], fixed, h, config,
                                 set(), set(range(h.total_slots)), set(range(7)), 0)
        assert len(result.placed) == 1
        placed = result.placed[0]
        # Start must be after fixed event ends + buffer
        # end_slot=100, buffer=1, so start >= 101
        start_slot = h.dt_to_slot(
            __import__("datetime").datetime.fromisoformat(placed.start_iso)
        )
        assert start_slot >= 101

    def test_no_feasible_event_marked_unplaced(self):
        h = _make_horizon(1)  # Only 1 day
        config = _make_config()
        # Event duration longer than horizon
        ev = _make_event(id="ev1", duration_minutes=60 * 24 * 2)  # 2 days
        result = greedy_schedule([ev], [], h, config,
                                 set(), set(range(h.total_slots)), set(range(7)), 0)
        assert len(result.unplaced) == 1
        assert result.unplaced[0].id == "ev1"
        assert "NoFeasibleSlotInGreedy" in result.unplaced[0].reason

    def test_moved_detected_when_slot_changes(self):
        h = _make_horizon()
        config = _make_config()
        # Event previously at slot 100; block slot 100 with fixed
        fixed = [_make_fixed("f1", 95, 115)]
        ev = _make_event(id="ev1", duration_minutes=30, current_start_slot=100)
        result = greedy_schedule([ev], fixed, h, config,
                                 set(), set(range(h.total_slots)), set(range(7)), 0)
        moved_ids = [m.id for m in result.moved]
        assert "ev1" in moved_ids

    def test_can_overlap_events_not_added_to_occupied(self):
        h = _make_horizon()
        config = _make_config()
        # Two overlapping events with can_overlap=True should both get placed
        ev1 = _make_event(id="ev1", can_overlap=True, duration_minutes=60)
        ev2 = _make_event(id="ev2", can_overlap=True, duration_minutes=60)
        result = greedy_schedule([ev1, ev2], [], h, config,
                                 set(), set(range(h.total_slots)), set(range(7)), 0)
        placed_ids = [p.id for p in result.placed]
        assert "ev1" in placed_ids
        assert "ev2" in placed_ids

    def test_result_has_no_score(self):
        h = _make_horizon()
        config = _make_config()
        result = greedy_schedule([], [], h, config, set(), set(), set(range(7)), 0)
        assert result.score is None

    def test_diagnostics_summary_contains_counts(self):
        h = _make_horizon()
        config = _make_config()
        ev = _make_event(id="ev1")
        result = greedy_schedule([ev], [], h, config,
                                 set(), set(range(h.total_slots)), set(range(7)), 0)
        assert "placed" in result.diagnostics.summary.lower()
