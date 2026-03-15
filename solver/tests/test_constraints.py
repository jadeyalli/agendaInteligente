"""Tests para solver/constraints.py — construcción del modelo CP-SAT."""
from __future__ import annotations

import pytest
from ortools.sat.python import cp_model

from solver.constraints import (
    add_exactly_one_constraints,
    add_no_overlap_constraint,
    build_objective,
    create_fixed_intervals,
    create_interval_vars,
)
from solver.models import CandidateCost, EventPriority, FixedEvent, FlexibleEvent, WindowType


def _make_flex(id: str, duration_slots: int = 6, can_overlap: bool = False) -> FlexibleEvent:
    return FlexibleEvent(
        id=id,
        priority=EventPriority.RELEVANT,
        duration_slots=duration_slots,
        can_overlap=can_overlap,
        current_start_slot=None,
        window_type=WindowType.NONE,
        window_start_slot=None,
        window_end_slot=None,
        category_rank=1,
    )


def _make_fixed(id: str, start: int, end: int, blocks: bool = True) -> FixedEvent:
    return FixedEvent(id=id, start_slot=start, end_slot=end, blocks_capacity=blocks)


def _make_cost(total: int = 0) -> CandidateCost:
    return CandidateCost(total=total, move=0, distance=0, off_preference=0, cross_day=0)


# ---------------------------------------------------------------------------
# add_exactly_one_constraints
# ---------------------------------------------------------------------------

class TestAddExactlyOneConstraints:
    def test_model_becomes_satisfiable_with_one_var_true(self):
        model = cp_model.CpModel()
        b1 = model.NewBoolVar("b1")
        b2 = model.NewBoolVar("b2")
        x_vars = {"ev1": [(0, b1), (1, b2)]}
        add_exactly_one_constraints(model, x_vars)

        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        assert status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

        # Exactly one must be true
        val1 = solver.Value(b1)
        val2 = solver.Value(b2)
        assert val1 + val2 == 1

    def test_zero_candidates_makes_infeasible(self):
        model = cp_model.CpModel()
        x_vars: dict = {"ev1": []}
        add_exactly_one_constraints(model, x_vars)
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        assert status == cp_model.INFEASIBLE

    def test_multiple_events_each_get_one(self):
        model = cp_model.CpModel()
        vars_ev1 = [(0, model.NewBoolVar("e1_s0")), (1, model.NewBoolVar("e1_s1"))]
        vars_ev2 = [(5, model.NewBoolVar("e2_s5")), (6, model.NewBoolVar("e2_s6"))]
        x_vars = {"ev1": vars_ev1, "ev2": vars_ev2}
        add_exactly_one_constraints(model, x_vars)
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        assert status in (cp_model.OPTIMAL, cp_model.FEASIBLE)


# ---------------------------------------------------------------------------
# create_interval_vars
# ---------------------------------------------------------------------------

class TestCreateIntervalVars:
    def test_can_overlap_returns_empty(self):
        model = cp_model.CpModel()
        x_vars = {("ev1", 0): model.NewBoolVar("b")}
        result = create_interval_vars(model, "ev1", [0], x_vars,
                                     duration_slots=6, buffer_slots=1, can_overlap=True)
        assert result == []

    def test_no_overlap_creates_intervals(self):
        model = cp_model.CpModel()
        candidates = [0, 10, 20]
        x_vars = {("ev1", s): model.NewBoolVar(f"b_{s}") for s in candidates}
        intervals = create_interval_vars(model, "ev1", candidates, x_vars,
                                        duration_slots=6, buffer_slots=1, can_overlap=False)
        assert len(intervals) == 3

    def test_interval_size_includes_buffer(self):
        model = cp_model.CpModel()
        candidates = [0]
        x_vars = {("ev1", 0): model.NewBoolVar("b0")}
        create_interval_vars(model, "ev1", candidates, x_vars,
                             duration_slots=6, buffer_slots=2, can_overlap=False)
        # Verify model is consistent — we just check it doesn't raise
        solver = cp_model.CpSolver()
        solver.Solve(model)


# ---------------------------------------------------------------------------
# create_fixed_intervals
# ---------------------------------------------------------------------------

class TestCreateFixedIntervals:
    def test_blocking_events_create_intervals(self):
        model = cp_model.CpModel()
        fixed = [_make_fixed("f1", 0, 10), _make_fixed("f2", 20, 30)]
        intervals = create_fixed_intervals(model, fixed)
        assert len(intervals) == 2

    def test_non_blocking_events_excluded(self):
        model = cp_model.CpModel()
        fixed = [_make_fixed("f1", 0, 10, blocks=False)]
        intervals = create_fixed_intervals(model, fixed)
        assert len(intervals) == 0

    def test_mixed_blocking_and_not(self):
        model = cp_model.CpModel()
        fixed = [
            _make_fixed("f1", 0, 10, blocks=True),
            _make_fixed("f2", 20, 30, blocks=False),
            _make_fixed("f3", 40, 50, blocks=True),
        ]
        intervals = create_fixed_intervals(model, fixed)
        assert len(intervals) == 2


# ---------------------------------------------------------------------------
# add_no_overlap_constraint
# ---------------------------------------------------------------------------

class TestAddNoOverlapConstraint:
    def test_empty_intervals_no_error(self):
        model = cp_model.CpModel()
        add_no_overlap_constraint(model, [])
        # No exception — model is still solvable
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        assert status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    def test_two_fixed_overlapping_makes_infeasible(self):
        model = cp_model.CpModel()
        # Two fixed intervals that overlap: [0,10) and [5,15)
        iv1 = model.NewIntervalVar(0, 10, 10, "iv1")
        iv2 = model.NewIntervalVar(5, 10, 15, "iv2")
        add_no_overlap_constraint(model, [iv1, iv2])
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        assert status == cp_model.INFEASIBLE


# ---------------------------------------------------------------------------
# build_objective
# ---------------------------------------------------------------------------

class TestBuildObjective:
    def test_minimize_prefers_lower_cost_candidate(self):
        model = cp_model.CpModel()
        ev = _make_flex("ev1")

        b0 = model.NewBoolVar("b0")
        b10 = model.NewBoolVar("b10")
        x_vars = {("ev1", 0): b0, ("ev1", 10): b10}
        x_vars_by_event = {"ev1": [(0, b0), (10, b10)]}

        add_exactly_one_constraints(model, x_vars_by_event)

        costs = {("ev1", 0): _make_cost(total=5), ("ev1", 10): _make_cost(total=1)}
        candidates = {"ev1": [0, 10]}

        build_objective(model, [ev], x_vars, costs, candidates)

        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        assert status == cp_model.OPTIMAL
        # Lower cost (slot=10, cost=1) should be chosen
        assert solver.Value(b10) == 1
        assert solver.Value(b0) == 0

    def test_zero_cost_objective_no_error(self):
        model = cp_model.CpModel()
        ev = _make_flex("ev1")
        b = model.NewBoolVar("b")
        x_vars = {("ev1", 0): b}
        x_vars_by_event = {"ev1": [(0, b)]}
        add_exactly_one_constraints(model, x_vars_by_event)
        costs = {("ev1", 0): _make_cost(total=0)}
        build_objective(model, [ev], x_vars, costs, {"ev1": [0]})
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        assert status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
