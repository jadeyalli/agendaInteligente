"""Punto de entrada CLI del solver.

Invocado por Node.js como: python -m solver <archivo.json>
Lee JSON de archivo o stdin, ejecuta solve_schedule, imprime resultado a stdout.
"""
from __future__ import annotations

import sys
import json
import argparse

from .engine import solve_schedule


def main() -> None:
    """Lee payload JSON, ejecuta el solver, imprime resultado JSON a stdout."""
    ap = argparse.ArgumentParser(description="Agenda Inteligente - Solver CSP")
    ap.add_argument("json", nargs="?", help="Ruta del archivo JSON de entrada (si no, lee stdin)")
    args = ap.parse_args()

    if args.json:
        with open(args.json, "r", encoding="utf-8") as f:
            payload = json.load(f)
    else:
        payload = json.load(sys.stdin)

    result = solve_schedule(payload)
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
