# Agenda Inteligente

Sistema de agendamiento inteligente con solver de satisfacción de restricciones (CP-SAT).
Proyecto de tesis.

## Requisitos

- Node.js >= 18
- Python >= 3.10
- OR-Tools (`pip install ortools`)
- npm

## Instalación

```bash
# Clonar repositorio
git clone [url]
cd agenda-inteligente

# Instalar dependencias Node
npm install

# Instalar dependencias Python
pip install ortools

# Configurar base de datos
cp .env.example .env
npx prisma migrate dev

# (Opcional) Cargar datos de prueba
npx tsx scripts/seed-e2e.ts
```

## Ejecución

```bash
# Desarrollo
npm run dev

# El servidor corre en http://localhost:3000
```

## Tests

```bash
# Tests del solver (Python)
pytest solver/tests/ -v

# Tests de servicios (TypeScript)
npx vitest run

# Tests E2E
npx vitest run src/services/__tests__/e2e-solver.test.ts
npx vitest run src/services/__tests__/e2e-collaborative.test.ts
```

## Arquitectura

```
src/
  app/api/           → API Routes (validación + delegación)
  services/          → Lógica de negocio
  repositories/      → Acceso a datos (Prisma)
  domain/            → Tipos, contratos, constantes
  components/        → React components

solver/              → Solver CP-SAT (Python)
  engine.py          → Motor principal
  constraints.py     → Restricciones R1-R7
  candidates.py      → Generación de candidatos
  models.py          → Dataclasses tipadas
  greedy.py          → Fallback
```

## Tipos de evento

| Tipo | En solver | Puede desplazar |
|------|-----------|-----------------|
| Crítico | No (fijo) | Urgente, Relevante |
| Urgente | Sí (flexible) | Relevante |
| Relevante | Sí (flexible) | Ninguno |
| Opcional | No (fuera del calendario) | N/A |
| Recordatorio | No (se solapa) | N/A |

## Modelo del solver

Minimiza: `Σ [ stability_mult × priority_weight × cat_weight × move_cost ]`

Restricciones duras: no solapamiento, ventana de disponibilidad, horarios habilitados,
buffer entre eventos, antelación mínima.

Estabilidad configurable: flexible (mueve libremente), balanceado (minimiza movimientos),
fijo (no mueve sin aprobación).

## Límites operativos

- Ventana máxima: 30 días
- Eventos flexibles: máximo 60 simultáneos
- Candidatos por evento: 150
- Timeout: 5 segundos
- Gap de optimalidad: 5%
- Granularidad: 5 minutos

## Stack tecnológico

- Next.js 14+ (App Router)
- TypeScript
- Prisma (SQLite dev / PostgreSQL prod)
- Python + OR-Tools CP-SAT
- React
- Tailwind CSS
