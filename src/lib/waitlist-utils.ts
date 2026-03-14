/** Tipos y utilidades compartidas entre el sidebar de espera y la página de lista de espera */

export type EventRow = {
  id: string;
  kind: 'EVENTO' | 'TAREA' | 'SOLICITUD' | 'RECORDATORIO';
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: 'CRITICA' | 'URGENTE' | 'RELEVANTE' | 'OPCIONAL' | 'RECORDATORIO' | null;
  status?: string | null;
  start?: string | null;
  end?: string | null;
  isAllDay?: boolean | null;
  dueDate?: string | null;
  window?: 'NONE' | 'PRONTO' | 'SEMANA' | 'MES' | 'RANGO' | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  durationMinutes?: number | null;
};

export type WaitlistGroup = { category: string; events: EventRow[] };

export const WAITLIST_CATEGORY_ORDER = [
  'Escuela',
  'Trabajo',
  'Personal',
  'Familia',
  'Salud',
  'Otros',
];

export const WAITLIST_WINDOW_LABELS: Record<Exclude<EventRow['window'], null | undefined | 'NONE'>, string> = {
  PRONTO: 'Próximos días',
  SEMANA: 'Esta semana',
  MES: 'Este mes',
  RANGO: 'Rango sugerido',
};

export const KIND_LABELS: Record<EventRow['kind'], string> = {
  EVENTO: 'Evento',
  TAREA: 'Tarea',
  SOLICITUD: 'Solicitud',
  RECORDATORIO: 'Recordatorio',
};

function normalizeCategory(value?: string | null): string {
  if (!value) return 'Otros';
  const trimmed = value.trim();
  if (!trimmed) return 'Otros';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Agrupa los eventos en lista de espera por categoría, ordenados por fecha y orden canónico. */
export function buildWaitlistGroups(rows: EventRow[]): WaitlistGroup[] {
  if (!rows.length) return [];
  const groups = new Map<string, EventRow[]>();

  for (const row of rows) {
    const priority = row.priority ?? undefined;
    const status = typeof row.status === 'string' ? row.status.toUpperCase() : '';
    if (priority !== 'OPCIONAL' && status !== 'WAITLIST') continue;
    if (row.kind === 'RECORDATORIO') continue;

    const category = normalizeCategory(row.category);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(row);
  }

  const getSortValue = (row: EventRow) =>
    row.start ? new Date(row.start).getTime() : Number.MAX_SAFE_INTEGER;

  const entries: WaitlistGroup[] = [];
  for (const [category, events] of groups.entries()) {
    entries.push({
      category,
      events: events.slice().sort((a, b) => {
        const diff = getSortValue(a) - getSortValue(b);
        return diff !== 0 ? diff : a.title.localeCompare(b.title, 'es');
      }),
    });
  }

  entries.sort((a, b) => {
    const idxA = WAITLIST_CATEGORY_ORDER.indexOf(a.category);
    const idxB = WAITLIST_CATEGORY_ORDER.indexOf(b.category);
    const orderA = idxA === -1 ? WAITLIST_CATEGORY_ORDER.length : idxA;
    const orderB = idxB === -1 ? WAITLIST_CATEGORY_ORDER.length : idxB;
    if (orderA !== orderB) return orderA - orderB;
    return a.category.localeCompare(b.category, 'es');
  });

  return entries;
}
