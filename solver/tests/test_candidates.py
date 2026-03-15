"""Tests para solver/candidates.py — generación y filtrado de candidatos."""
from __future__ import annotations

import math
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from solver.candidates import (
    calculate_cost,
    expand_window_slots,
    filter_by_enabled_days,
    filter_by_lead_time,
    filter_by_preference,
    generate_candidates,
    remove_conflicting_with_fixed,
)
from solver.models import (
    CandidateCost,
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
    id: str = "ev1",
    priority: EventPriority = EventPriority.RELEVANT,
    duration_minutes: int = 60,
    can_overlap: bool = False,
    window_type: WindowType = WindowType.NONE,
    current_start_slot: int | None = None,
    category_rank: int = 1,
    window_start_slot: int | None = None,
    window_end_slot: int | None = None,
) -> FlexibleEvent:
    slots_per_min = 1 / SLOT_MIN
    duration_slots = math.ceil(duration_minutes * slots_per_min)
    return FlexibleEvent(
        id=id,
        priority=priority,
        duration_slots=duration_slots,
        can_overlap=can_overlap,
        current_start_slot=current_start_slot,
        window_type=window_type,
        window_start_slot=window_start_slot,
        window_end_slot=window_end_slot,
        category_rank=category_rank,
    )


def _make_config(
    stability: StabilityMode = StabilityMode.FLEXIBLE,
    total_cats: int = 2,
) -> SolverConfig:
    return SolverConfig(
        buffer_slots=1,
        lead_time_slot=0,
        stability=stability,
        categories=[],
        total_categories=total_cats,
    )


def _make_fixed(id: str, start_slot: int, end_slot: int, blocks: bool = True) -> FixedEvent:
    return FixedEvent(id=id, start_slot=start_slot, end_slot=end_slot, blocks_capacity=blocks)


# ---------------------------------------------------------------------------
# expand_window_slots
# ---------------------------------------------------------------------------

class TestExpandWindowSlots:
    def test_pronto_returns_48h_from_now(self):
        h = _make_horizon(7)
        ev = _make_event(window_type=WindowType.PRONTO)
        now_slot = 0
        slots = expand_window_slots(ev, h, now_slot)
        expected_max = math.ceil(48 * 60 / SLOT_MIN)
        assert len(slots) <= expected_max
        assert all(s >= 0 for s in slots)

    def test_semana_covers_full_week(self):
        h = _make_horizon(14)
        ev = _make_event(window_type=WindowType.SEMANA)
        slots = expand_window_slots(ev, h, now_slot=0)
        # Slots should span a week: 7 * 24 * 60 / 5 = 2016
        assert len(slots) <= 7 * 24 * 60 // SLOT_MIN + 1

    def test_none_returns_full_horizon(self):
        h = _make_horizon(7)
        ev = _make_event(window_type=WindowType.NONE)
        slots = expand_window_slots(ev, h, now_slot=0)
        assert len(slots) == h.total_slots

    def test_rango_with_bounds(self):
        h = _make_horizon(7)
        ev = _make_event(window_type=WindowType.RANGO, window_start_slot=10, window_end_slot=50)
        slots = expand_window_slots(ev, h, now_slot=0)
        assert slots == list(range(10, 50))

    def test_rango_without_bounds_returns_empty(self):
        h = _make_horizon(7)
        ev = _make_event(window_type=WindowType.RANGO)
        slots = expand_window_slots(ev, h, now_slot=0)
        assert slots == []


# ---------------------------------------------------------------------------
# filter_by_enabled_days
# ---------------------------------------------------------------------------

class TestFilterByEnabledDays:
    def test_all_days_allowed_no_filter(self):
        h = _make_horizon(7)
        starts = list(range(0, 100))
        result = filter_by_enabled_days(starts, 1, h, set(range(7)))
        assert result == starts

    def test_weekend_excluded(self):
        h = _make_horizon(7)
        # 2026-10-05 is Monday, 2026-10-10/11 are Sat/Sun
        weekdays_only = {0, 1, 2, 3, 4}
        # slots per day = 24*60/5 = 288
        slots_per_day = 288
        # Saturday starts at slot 5 * slots_per_day
        saturday_slot = 5 * slots_per_day
        starts = [saturday_slot]
        result = filter_by_enabled_days(starts, 1, h, weekdays_only)
        assert result == []

    def test_monday_included(self):
        h = _make_horizon(7)
        weekdays_only = {0, 1, 2, 3, 4}
        # Monday slot = first slot of day 0
        monday_slot = 0
        result = filter_by_enabled_days([monday_slot], 1, h, weekdays_only)
        assert monday_slot in result


# ---------------------------------------------------------------------------
# filter_by_lead_time
# ---------------------------------------------------------------------------

class TestFilterByLeadTime:
    def test_past_slots_excluded(self):
        result = filter_by_lead_time([0, 5, 10, 20], now_slot=10, current_start_slot=None)
        assert all(s >= 10 for s in result)

    def test_current_slot_kept_even_if_past(self):
        result = filter_by_lead_time([0, 5, 10, 20], now_slot=10, current_start_slot=5)
        assert 5 in result

    def test_current_not_added_if_not_in_starts(self):
        # current_start_slot=3 is not in starts=[0,5], so it shouldn't appear
        result = filter_by_lead_time([0, 5, 10], now_slot=10, current_start_slot=3)
        assert 3 not in result

    def test_empty_input(self):
        result = filter_by_lead_time([], now_slot=5, current_start_slot=None)
        assert result == []


# ---------------------------------------------------------------------------
# remove_conflicting_with_fixed
# ---------------------------------------------------------------------------

class TestRemoveConflictingWithFixed:
    def test_slot_overlapping_fixed_removed(self):
        fixed = [_make_fixed("f1", start_slot=10, end_slot=20)]
        # slot 8 with duration=4 ends at 12, overlaps [10,20) with buffer=0
        result = remove_conflicting_with_fixed([8], duration_slots=4, fixed=fixed, buffer_slots=0)
        assert 8 not in result

    def test_slot_before_fixed_kept(self):
        fixed = [_make_fixed("f1", start_slot=10, end_slot=20)]
        result = remove_conflicting_with_fixed([0], duration_slots=4, fixed=fixed, buffer_slots=0)
        assert 0 in result

    def test_slot_after_fixed_kept(self):
        fixed = [_make_fixed("f1", start_slot=10, end_slot=20)]
        result = remove_conflicting_with_fixed([20], duration_slots=4, fixed=fixed, buffer_slots=0)
        assert 20 in result

    def test_buffer_creates_gap(self):
        fixed = [_make_fixed("f1", start_slot=10, end_slot=20)]
        # slot 18, duration=2, end=20; with buffer=2 we need end+buffer <= 10 or start >= 20+2
        # 20+2=22: 18 >= 22? No. 20+2 <= 10? No. So conflicting.
        result = remove_conflicting_with_fixed([18], duration_slots=2, fixed=fixed, buffer_slots=2)
        assert 18 not in result

    def test_non_blocking_fixed_ignored(self):
        fixed = [_make_fixed("f1", start_slot=10, end_slot=20, blocks=False)]
        result = remove_conflicting_with_fixed([8], duration_slots=4, fixed=fixed, buffer_slots=0)
        assert 8 in result


# ---------------------------------------------------------------------------
# filter_by_preference
# ---------------------------------------------------------------------------

class TestFilterByPreference:
    def test_preferred_slots_win(self):
        preferred = {5, 6, 7, 8}
        working = set(range(0, 20))
        result = filter_by_preference([5, 10, 15], duration_slots=1, preferred_slots=preferred, working_slots=working)
        assert result == [5]

    def test_fallback_to_working_when_no_preferred(self):
        preferred = {100}  # none of the candidates
        working = {10, 11}
        result = filter_by_preference([10, 20], duration_slots=1, preferred_slots=preferred, working_slots=working)
        assert 10 in result
        assert 20 not in result

    def test_fallback_to_any_when_no_working(self):
        preferred: set = set()
        working: set = set()
        result = filter_by_preference([5, 10, 15], duration_slots=1, preferred_slots=preferred, working_slots=working)
        assert result == [5, 10, 15]


# ---------------------------------------------------------------------------
# calculate_cost
# ---------------------------------------------------------------------------

class TestCalculateCost:
    def test_flexible_stability_always_zero_total(self):
        h = _make_horizon()
        config = _make_config(StabilityMode.FLEXIBLE)
        ev = _make_event(priority=EventPriority.URGENT, current_start_slot=10)
        cost = calculate_cost(ev, start_slot=50, now_slot=0, config=config,
                              preferred_slots=set(), horizon=h)
        assert cost.total == 0

    def test_balanced_total_formula(self):
        h = _make_horizon()
        config = _make_config(StabilityMode.BALANCED, total_cats=3)
        # stability_mult=1, priority_weight=3(urgent), cat_weight=3-1+1=3
        # move = |50 - 10| = 40
        # total = 1 * 3 * 3 * 40 = 360
        ev = _make_event(priority=EventPriority.URGENT, category_rank=1, current_start_slot=10)
        cost = calculate_cost(ev, start_slot=50, now_slot=0, config=config,
                              preferred_slots=set(), horizon=h)
        assert cost.total == 360

    def test_fixed_stability_multiplies_by_10(self):
        h = _make_horizon()
        config = _make_config(StabilityMode.FIXED, total_cats=2)
        # stability_mult=10, priority=relevant(1), cat_weight=2-2+1=1, move=5
        # total = 10 * 1 * 1 * 5 = 50
        ev = _make_event(priority=EventPriority.RELEVANT, category_rank=2, current_start_slot=0)
        cost = calculate_cost(ev, start_slot=5, now_slot=0, config=config,
                              preferred_slots=set(), horizon=h)
        assert cost.total == 50

    def test_no_current_slot_move_is_zero(self):
        h = _make_horizon()
        config = _make_config(StabilityMode.FIXED)
        ev = _make_event(current_start_slot=None)
        cost = calculate_cost(ev, start_slot=100, now_slot=0, config=config,
                              preferred_slots=set(), horizon=h)
        assert cost.move == 0
        assert cost.total == 0  # move=0 makes total=0 regardless of multiplier


# ---------------------------------------------------------------------------
# generate_candidates (integration)
# ---------------------------------------------------------------------------

class TestGenerateCandidates:
    def test_returns_empty_when_no_feasible(self):
        h = _make_horizon(1)  # 1 day horizon
        config = _make_config()
        # Event duration larger than horizon
        ev = _make_event(duration_minutes=24 * 60 * 7)  # 1 week
        slots, costs = generate_candidates(ev, h, config, [], 0, set(), set(), set(range(7)))
        assert slots == []
        assert costs == {}

    def test_candidates_truncated_to_max(self):
        h = _make_horizon(7)
        config = _make_config()
        config.max_candidates_per_event = 5
        ev = _make_event(window_type=WindowType.NONE)
        slots, costs = generate_candidates(ev, h, config, [], 0, set(), set(), set(range(7)))
        assert len(slots) <= 5

    def test_sorted_by_total_cost(self):
        h = _make_horizon(7)
        config = _make_config(StabilityMode.BALANCED)
        ev = _make_event(current_start_slot=100, window_type=WindowType.NONE)
        slots, costs = generate_candidates(ev, h, config, [], 0, set(), set(), set(range(7)))
        if len(slots) >= 2:
            totals = [costs[s].total for s in slots]
            assert totals == sorted(totals)

    def test_fixed_blocker_removed_from_candidates(self):
        h = _make_horizon(7)
        config = _make_config()
        # Block slot 0..11 (1 hour = 12 slots of 5min)
        fixed = [_make_fixed("f1", start_slot=0, end_slot=12)]
        ev = _make_event(duration_minutes=30, window_type=WindowType.RANGO,
                         window_start_slot=0, window_end_slot=20)
        slots, _ = generate_candidates(ev, h, config, fixed, 0, set(), set(), set(range(7)))
        # No slot starting in [0,12) should appear with duration 6 slots + 1 buffer = 7 total
        for s in slots:
            assert s + 6 + 1 <= 0 or s >= 12 + 1
