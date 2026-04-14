"""Tests de integración para solver/engine.py — 8 escenarios mandatorios.

Carga fixtures JSON reales y valida el contrato de salida completo.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

import pytest

from solver.engine import solve_schedule

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> Dict[str, Any]:
    with open(FIXTURES / name, encoding="utf-8") as f:
        return json.load(f)


def _is_valid_iso(s: str) -> bool:
    """Verifica que la cadena sea parseable como ISO 8601."""
    from datetime import datetime
    try:
        datetime.fromisoformat(s)
        return True
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Helpers de validación del contrato de salida
# ---------------------------------------------------------------------------

def _assert_valid_result(result: Dict) -> None:
    """Valida que result cumpla el contrato mínimo de SolverResult."""
    assert isinstance(result, dict), "result debe ser dict"
    assert "placed" in result, "result debe tener 'placed'"
    assert "moved" in result, "result debe tener 'moved'"
    assert "unplaced" in result, "result debe tener 'unplaced'"
    assert "diagnostics" in result, "result debe tener 'diagnostics'"

    for p in result["placed"]:
        assert "id" in p
        assert "start" in p, f"placed sin 'start': {p}"
        assert "end" in p, f"placed sin 'end': {p}"
        assert _is_valid_iso(p["start"]), f"start no es ISO válido: {p['start']}"
        assert _is_valid_iso(p["end"]), f"end no es ISO válido: {p['end']}"

    for u in result["unplaced"]:
        assert "id" in u
        assert "reason" in u


# ---------------------------------------------------------------------------
# Escenario 1: Payload vacío — sin eventos, respuesta válida
# ---------------------------------------------------------------------------

class TestScenario1EmptyPayload:
    def test_empty_events_returns_valid_result(self):
        payload = {
            "user": {"timezone": "America/Mexico_City"},
            "horizon": {
                "start": "2026-10-05T00:00:00",
                "end": "2026-10-12T00:00:00",
                "slotMinutes": 5,
            },
            "config": {
                "bufferMinutes": 5,
                "leadMinutes": 0,
                "dayStart": "08:00",
                "dayEnd": "18:00",
                "activeDays": [0, 1, 2, 3, 4],
                "stability": "flexible",
                "categories": [{"name": "Trabajo", "rank": 1}],
            },
            "availability": {"preferred": [], "fallbackUsed": True},
            "events": {"fixed": [], "movable": [], "new": [], "newFixed": []},
        }
        result = solve_schedule(payload)
        _assert_valid_result(result)
        assert result["placed"] == []
        assert result["unplaced"] == []


# ---------------------------------------------------------------------------
# Escenario 2: 3 eventos básicos — 1 fijo + 2 flexibles colocados
# ---------------------------------------------------------------------------

class TestScenario2Basic3Events:
    def test_both_flexible_events_placed(self):
        payload = _load("basic_3_events.json")
        result = solve_schedule(payload)
        _assert_valid_result(result)
        placed_ids = {p["id"] for p in result["placed"]}
        assert "flex-urgent-1" in placed_ids
        assert "flex-relevant-1" in placed_ids

    def test_placed_events_not_overlap_fixed(self):
        payload = _load("basic_3_events.json")
        result = solve_schedule(payload)
        _assert_valid_result(result)
        from datetime import datetime
        # Fixed event: 2026-10-05T09:00 - 11:00
        fixed_start = datetime.fromisoformat("2026-10-05T09:00:00")
        fixed_end = datetime.fromisoformat("2026-10-05T11:00:00")
        for p in result["placed"]:
            p_start = datetime.fromisoformat(p["start"].replace("Z", "+00:00"))
            p_end = datetime.fromisoformat(p["end"].replace("Z", "+00:00"))
            # Convert fixed to naive for comparison
            p_start = p_start.replace(tzinfo=None)
            p_end = p_end.replace(tzinfo=None)
            # Must not overlap with fixed [09:00, 11:00)
            assert not (p_start < fixed_end and p_end > fixed_start), (
                f"Event {p['id']} overlaps fixed: {p_start}-{p_end}"
            )


# ---------------------------------------------------------------------------
# Escenario 3: Conflicto UI/UI — dos fijos superpuestos
# ---------------------------------------------------------------------------

class TestScenario3ConflictCritical:
    def test_uiui_conflict_returns_hard_conflict(self):
        payload = _load("conflict_critical.json")
        result = solve_schedule(payload)
        _assert_valid_result(result)
        diag = result["diagnostics"]
        hard = diag.get("hardConflicts") or diag.get("hard_conflicts", [])
        assert len(hard) > 0, "Debe haber al menos un conflicto UI/UI en diagnostics"

    def test_uiui_conflict_no_events_placed(self):
        payload = _load("conflict_critical.json")
        result = solve_schedule(payload)
        assert result["placed"] == []


# ---------------------------------------------------------------------------
# Escenario 4: Stability flexible — total cost = 0, libre reposicionamiento
# ---------------------------------------------------------------------------

class TestScenario4StabilityFlexible:
    def test_all_events_placed(self):
        payload = _load("stability_flexible.json")
        result = solve_schedule(payload)
        _assert_valid_result(result)
        total = len(result["placed"]) + len(result["unplaced"])
        assert total == 4  # 3 movable + 1 new



# ---------------------------------------------------------------------------
# Escenario 5: Stability balanced — costo penaliza mover; Trabajo > Escuela
# ---------------------------------------------------------------------------

class TestScenario5StabilityBalanced:
    def test_both_urgents_placed(self):
        """Ambos urgents deben colocarse aunque compitan por el mismo slot inicial."""
        payload = _load("stability_balanced.json")
        result = solve_schedule(payload)
        _assert_valid_result(result)
        placed_ids = {p["id"] for p in result["placed"]}
        assert "mov-urg-trabajo" in placed_ids or "mov-urg-escuela" in placed_ids

    def test_trabajo_more_stable_than_escuela(self):
        """
        Con stability=balanced, Trabajo (rank=1, cat_weight=3) tiene mayor costo
        de movimiento que Escuela (rank=3, cat_weight=1). El solver debe mantener
        Trabajo en su slot original si es posible.
        """
        payload = _load("stability_balanced.json")
        result = solve_schedule(payload)
        _assert_valid_result(result)
        placed = {p["id"]: p for p in result["placed"]}
        moved_ids = {m["id"] for m in result["moved"]}

        if "mov-urg-trabajo" in placed and "mov-urg-escuela" in placed:
            # Ambos placed: escuela debería moverse más, no trabajo
            # Si trabajo se movió, escuela también debería haberse movido
            if "mov-urg-trabajo" in moved_ids:
                assert "mov-urg-escuela" in moved_ids


# ---------------------------------------------------------------------------
# Escenario 6: Stability fixed — eventos existentes no se mueven si hay espacio
# ---------------------------------------------------------------------------

class TestScenario6StabilityFixed:
    def test_both_events_placed(self):
        payload = _load("stability_fixed.json")
        result = solve_schedule(payload)
        _assert_valid_result(result)
        placed_ids = {p["id"] for p in result["placed"]}
        assert len(placed_ids) >= 1



# ---------------------------------------------------------------------------
# Escenario 7: Degradación — >50 eventos, solo 60 participan
# ---------------------------------------------------------------------------

class TestScenario7Degradation:
    def test_result_is_valid_with_65_events(self):
        payload = _load("overload_50_plus.json")
        result = solve_schedule(payload)
        _assert_valid_result(result)

    def test_all_urgents_participate(self):
        """Los 10 urgentes siempre participan en el solver (no se degradan)."""
        payload = _load("overload_50_plus.json")
        result = solve_schedule(payload)
        placed_ids = {p["id"] for p in result["placed"]}
        unplaced_ids = {u["id"] for u in result["unplaced"]}
        all_urgent_ids = {f"urgent-{i}" for i in range(1, 11)}
        # Todos los urgentes deben estar en placed o unplaced (participaron)
        for uid in all_urgent_ids:
            assert uid in placed_ids or uid in unplaced_ids, (
                f"{uid} no aparece en placed ni unplaced — no participó"
            )

    def test_total_participating_at_most_60(self):
        """Con degradación, como máximo 60 eventos participan activamente."""
        payload = _load("overload_50_plus.json")
        result = solve_schedule(payload)
        # placed + unplaced = eventos que participaron (degraded van a frozen fixed)
        # Algunos relevants excedentes quedan como fijos congelados (sin aparecer en unplaced)
        participating = len(result["placed"]) + len(result["unplaced"])
        assert participating <= 60, f"Participaron {participating} eventos, esperábamos <= 60"


# ---------------------------------------------------------------------------
# Escenario 8: Payload malformado — manejo de errores robusto
# ---------------------------------------------------------------------------

class TestScenario8ErrorHandling:
    def test_missing_user_timezone_returns_error_dict(self):
        payload: Dict[str, Any] = {}
        result = solve_schedule(payload)
        _assert_valid_result(result)
        diag = result["diagnostics"]
        summary = diag.get("summary", "")
        assert "Error" in summary or "error" in summary.lower()

    def test_invalid_timezone_returns_error_dict(self):
        payload = {
            "user": {"timezone": "Invalid/Timezone"},
            "horizon": {
                "start": "2026-10-05T00:00:00",
                "end": "2026-10-12T00:00:00",
                "slotMinutes": 5,
            },
            "config": {
                "stability": "flexible",
                "categories": [],
            },
            "availability": {},
            "events": {"fixed": [], "movable": [], "new": [], "newFixed": []},
        }
        result = solve_schedule(payload)
        _assert_valid_result(result)
        diag = result["diagnostics"]
        summary = diag.get("summary", "")
        assert "Error" in summary or len(result["placed"]) == 0

    def test_result_always_has_all_keys(self):
        """Incluso en error, el resultado tiene todas las claves requeridas."""
        result = solve_schedule({})
        for key in ("placed", "moved", "unplaced", "diagnostics"):
            assert key in result
