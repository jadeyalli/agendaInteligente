'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import type { EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import multiMonthPlugin from '@fullcalendar/multimonth';
import esLocale from '@fullcalendar/core/locales/es';

import CreateEditModal, { type CreateModalSubmitPayload } from '@/components/create/Modal';
import IcsImportModal from '@/components/ics/IcsImportModal';
import EventPreviewModal, { type EventRow as PreviewRow } from '@/components/EventPreviewModal';

import { THEMES, currentTheme } from '@/theme/themes';
import {
  dateToDateStringLocal,
  dateToTimeStringLocal,
  debugDateFull,
  isoToDate,
  resolveBrowserTimezone,
} from '@/lib/timezone';

export type ViewId = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'multiMonthYear';
export type CalendarMeta = { view: ViewId; title: string; start: Date; end: Date };
export type CalendarProps = { onViewChange?: (meta: CalendarMeta) => void };

type PriorityCode = 'CRITICA' | 'URGENTE' | 'RELEVANTE' | 'OPCIONAL' | 'RECORDATORIO';

type EventRow = {
  id: string;
  kind: 'EVENTO' | 'TAREA' | 'SOLICITUD' | 'RECORDATORIO';
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: 'CRITICA' | 'URGENTE' | 'RELEVANTE' | 'OPCIONAL' | 'RECORDATORIO' | null;

  // tiempo
  start?: string | null;
  end?: string | null;
  isAllDay?: boolean | null;

  // tarea
  dueDate?: string | null;

  // ventana
  window?: 'NONE' | 'PRONTO' | 'SEMANA' | 'MES' | 'RANGO' | null;
  windowStart?: string | null;
  windowEnd?: string | null;
};

type ModalInitialEvent = {
  kind: 'EVENTO';
  title: string;
  description: string;
  category: string;
  priority: PriorityCode;
  repeat: 'NONE';
  window: 'NONE';
  date: string;
  timeStart: string;
  timeEnd: string;
};

type ModalInitialReminder = {
  kind: 'RECORDATORIO';
  title: string;
  description: string;
  category: string;
  repeat: 'NONE';
  isAllDay: boolean;
  date: string;
  timeStart: string;
  timeEnd: string;
};

type ModalInitialReminder = {
  kind: 'RECORDATORIO';
  title: string;
  description: string;
  category: string;
  repeat: 'NONE';
  isAllDay: boolean;
  date: string;
  timeStart: string;
  timeEnd: string;
};

type ModalInitial = ModalInitialEvent | ModalInitialTask | ModalInitialReminder;

export default function Calendar({ onViewChange }: CalendarProps) {
  // === tema (escucha cambios emitidos por la página) ===
  const [theme, setTheme] = useState(currentTheme());
  useEffect(() => {
    const onChange = () => setTheme(currentTheme());
    window.addEventListener('ai-theme-change', onChange);
    return () => window.removeEventListener('ai-theme-change', onChange);
  }, []);

  // === estado calendario ===
  const [view, setView] = useState<ViewId>('timeGridWeek');
  const [weekends, setWeekends] = useState(true);
  const [title, setTitle] = useState<string>('');
  const [viewTransitioning, setViewTransitioning] = useState(false);

  const [openCreate, setOpenCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [openEdit, setOpenEdit] = useState(false);
  const [editInitial, setEditInitial] = useState<ModalInitial | null>(null);
  const [editTab, setEditTab] = useState<'evento' | 'recordatorio'>('evento');
  const browserTimeZone = useMemo(() => resolveBrowserTimezone(), []);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [openImport, setOpenImport] = useState(false);

  // Vista previa
  const [openPreview, setOpenPreview] = useState(false);
  const [selected, setSelected] = useState<PreviewRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // datos del backend y rango visible
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | null>(null);

  const calendarRef = useRef<FullCalendar | null>(null);
  const api = () => calendarRef.current?.getApi();

  // evita loops al cambiar vista/rango
  const lastMetaRef = useRef<{ view: ViewId; title: string; startMs: number; endMs: number } | null>(null);

  // helper: YYYY-MM-DD
  const toDateOnly = (d: string | Date | null | undefined) => {
    if (!d) return null;
    const s = typeof d === 'string' ? d : d.toISOString();
    return s.slice(0, 10);
  };

  // ====== Cargar eventos del backend (usuario demo) ======
  async function loadEvents() {
    try {
      setLoading(true);
      const res = await fetch('/api/events?scope=all', { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudieron cargar los eventos');
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEvents(); }, []);

  // ====== Crear desde el modal ======
  async function handleCreateFromModal(payload: CreateModalSubmitPayload) {
    try {
      setCreating(true);
      const res = await fetch('/api/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo crear');
      }
      setOpenCreate(false);
      await loadEvents();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al crear';
      alert(message);
    } finally {
      setCreating(false);
    }
  }

  // ====== Editar desde el modal ======
  async function handleEditFromModal(payload: CreateModalSubmitPayload) {
    if (!editingId) return;
    try {
      setCreating(true);
      const res = await fetch(`/api/events?id=${encodeURIComponent(editingId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo actualizar');
      }
      setOpenEdit(false);
      setEditingId(null);
      await loadEvents();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al actualizar';
      alert(message);
    } finally {
      setCreating(false);
    }
  }

  // ====== Eliminar ======
  async function handleDelete(e: PreviewRow) {
    try {
      setDeleting(true);
      const res = await fetch(`/api/events?id=${encodeURIComponent(e.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo eliminar');
      }
      setOpenPreview(false);
      setSelected(null);
      await loadEvents();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar';
      alert(message);
    } finally {
      setDeleting(false);
    }
  }

function mapRowToEditInitial(row: EventRow, timeZone: string): ModalInitial | null {
  // Si es TAREA
  if (row.kind === 'TAREA') {
    return null;
  }

  if (row.kind === 'RECORDATORIO' || row.priority === 'RECORDATORIO') {
    const startDate = row.start ? isoToDate(row.start) : null;
    const endDate = row.end ? isoToDate(row.end) : null;

    return {
      kind: 'RECORDATORIO',
      title: row.title,
      description: row.description ?? '',
      category: row.category ?? '',
      repeat: 'NONE',
      dueDate: dateToDateStringLocal(dueDate, timeZone),
    };
  }

  if (row.kind === 'RECORDATORIO' || row.priority === 'RECORDATORIO') {
    const startDate = row.start ? isoToDate(row.start) : null;
    const endDate = row.end ? isoToDate(row.end) : null;

    return {
      kind: 'RECORDATORIO',
      title: row.title,
      description: row.description ?? '',
      category: row.category ?? '',
      repeat: 'NONE',
      isAllDay: !!row.isAllDay,
      date: dateToDateStringLocal(startDate, timeZone),
      timeStart: dateToTimeStringLocal(startDate, timeZone),
      timeEnd: dateToTimeStringLocal(endDate, timeZone),
    };
  }

  // Si es EVENTO
  const startDate = row.start ? isoToDate(row.start) : null;
  const endDate = row.end ? isoToDate(row.end) : null;

  // ✅ DEBUG
  console.debug('START en mapRowToEditInitial', debugDateFull(startDate, timeZone));
  console.debug('END en mapRowToEditInitial', debugDateFull(endDate, timeZone));

  return {
    kind: 'EVENTO',
    title: row.title,
    description: row.description ?? '',
    category: row.category ?? '',
    priority: (row.priority ?? 'RELEVANTE') as PriorityCode,
    repeat: 'NONE',
    window: 'NONE',
    // ✅ CAMBIOS PRINCIPALES:
    date: dateToDateStringLocal(startDate, timeZone),
    timeStart: dateToTimeStringLocal(startDate, timeZone),
    timeEnd: dateToTimeStringLocal(endDate, timeZone),
  };
}
  // ====== Mapeo a FullCalendar con colores del tema ======
  const fcEvents = useMemo<EventInput[]>(() => {
    if (!rows.length) return [];
    const out: EventInput[] = [];

    const labelColors = THEMES[theme].labels;
    const labelFgs = THEMES[theme].labelsFg;

    for (const row of rows) {
      const kind = row.kind || 'EVENTO';
      const startStr = row.start || null;
      const endStr = row.end || null;
      const dueStr = row.dueDate || null;
      const windowCode = row.window || 'NONE';
      const p = (row.priority || 'RELEVANTE') as 'CRITICA' | 'URGENTE' | 'RELEVANTE' | 'OPCIONAL' | 'RECORDATORIO';
      const classNames = [`prio-${p}`];

      // 1) Eventos con start/end
      if (startStr) {
        if (row.isAllDay) {
          const sDay = toDateOnly(startStr)!;
          const eDay = endStr ? toDateOnly(endStr)! : undefined;
          out.push({
            id: row.id,
            title: row.title,
            start: sDay,
            end: eDay,
            allDay: true,
            classNames,
            color: labelColors[p],
            textColor: labelFgs[p],
            extendedProps: { kind, priority: row.priority, raw: row },
          });
        } else {
          out.push({
            id: row.id,
            title: row.title,
            start: startStr,
            end: endStr ?? undefined,
            allDay: !!row.isAllDay,
            classNames,
            color: labelColors[p],
            textColor: labelFgs[p],
            extendedProps: { kind, priority: row.priority, raw: row },
          });
        }
        continue;
      }

      // 2) Tareas con dueDate -> allDay ese día
      if (kind === 'TAREA' && dueStr) {
        out.push({
          id: row.id,
          title: `🗒️ ${row.title}`,
          start: toDateOnly(dueStr)!,
          allDay: true,
          classNames,
          color: labelColors[p],
          textColor: labelFgs[p],
          extendedProps: { kind, priority: row.priority, raw: row },
        });
        continue;
      }

      // 3) Ventanas visuales opcionales
      if (windowCode && windowCode !== 'NONE') {
        if (windowCode === 'RANGO' && row.windowStart) {
          const sDay = toDateOnly(row.windowStart)!;
          const eDay = row.windowEnd ? toDateOnly(row.windowEnd)! : undefined;
          out.push({
            id: `${row.id}-win`,
            title: row.title,
            start: sDay,
            end: eDay,
            display: 'background',
            classNames: ['bg-window-range'],
            allDay: true,
            extendedProps: { kind, priority: row.priority, raw: row, isWindow: true },
          });
        } else if (visibleRange) {
          out.push({
            id: `${row.id}-winv`,
            title: row.title,
            start: visibleRange.start,
            end: visibleRange.end,
            display: 'background',
            classNames: ['bg-window-soft'],
            extendedProps: { kind, priority: row.priority, raw: row, isWindow: true, code: windowCode },
          });
        }
      }
    }

    return out;
  }, [rows, visibleRange, theme]);

  // Navegación
  const changeView = (v: ViewId) => {
    if (view === v) return;
    setView(v);
    setViewTransitioning(true);
    api()?.changeView(v);
  };
  const prev = () => api()?.prev();
  const next = () => api()?.next();
  const today = () => api()?.today();

  // Estilos botones
  const viewBtn = (active: boolean) =>
    [
      'inline-flex items-center justify-center rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-out',
      active
        ? 'bg-slate-900 text-white shadow-sm'
        : 'text-[var(--muted)] hover:text-[var(--fg)] hover:bg-slate-900/5',
      active && viewTransitioning ? 'view-toggle-animate' : '',
    ]
      .filter(Boolean)
      .join(' ');
  const navBtn =
    'inline-flex items-center justify-center rounded-full border border-slate-200/70 bg-white/70 px-4 py-1.5 text-sm font-medium text-[var(--fg)] shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white';
  const arrowBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/70 text-sm font-medium text-[var(--fg)] shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30';

  useEffect(() => {
    if (!viewTransitioning) return;
    const handle = window.setTimeout(() => setViewTransitioning(false), 320);
    return () => window.clearTimeout(handle);
  }, [viewTransitioning]);

  useEffect(() => {
    api()?.updateSize();
  }, [view, weekends, visibleRange]);

  const toolbarOffset = 'calc(var(--app-header-height, 72px) + 1rem)';

  return (
    <div className="flex h-full flex-col gap-6">
      <header
        className="calendar-toolbar sticky z-30 rounded-3xl border border-slate-200/70 bg-[var(--surface)]/80 px-4 py-4 shadow-sm backdrop-blur"
        style={{ top: toolbarOffset }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button className={navBtn} type="button" onClick={today}>
              Hoy
            </button>
            <div className="text-base font-semibold text-[var(--fg)] sm:text-lg">{title || ' '}</div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.3em] text-[var(--muted)]">
              <span>Vista</span>
              <span className="h-1 w-8 rounded-full bg-slate-200" />
            </div>
            <div className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 p-1 shadow-inner">
              <button className={viewBtn(view === 'timeGridDay')} onClick={() => changeView('timeGridDay')} type="button">
                Día
              </button>
              <button className={viewBtn(view === 'timeGridWeek')} onClick={() => changeView('timeGridWeek')} type="button">
                Semana
              </button>
              <button className={viewBtn(view === 'dayGridMonth')} onClick={() => changeView('dayGridMonth')} type="button">
                Mes
              </button>
              <button className={viewBtn(view === 'multiMonthYear')} onClick={() => changeView('multiMonthYear')} type="button">
                Año
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 text-sm font-medium text-[var(--muted)] shadow-sm">
              <span>Fines de semana</span>
              <label className="relative inline-flex h-6 w-11 items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={weekends}
                  onChange={(e) => setWeekends(e.target.checked)}
                />
                <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-indigo-500" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </label>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-2 py-1 shadow-sm">
              <button className={arrowBtn} type="button" onClick={prev} aria-label="Vista anterior">
                ◀
              </button>
              <button className={arrowBtn} type="button" onClick={next} aria-label="Vista siguiente">
                ▶
              </button>
            </div>

            <button
              className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
              onClick={() => setOpenCreate(true)}
              type="button"
              disabled={creating}
            >
              {creating ? 'Creando…' : 'Crear evento'}
            </button>
            <button
              className="inline-flex items-center rounded-full border border-slate-200/70 bg-white/70 px-5 py-2 text-sm font-semibold text-[var(--fg)] shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
              onClick={() => setOpenImport(true)}
              type="button"
            >
              Importar .ICS
            </button>
          </div>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden rounded-3xl border border-slate-200/70 bg-[var(--surface)]/90 shadow-sm">
        <div className="relative h-full overflow-hidden">
          <div className="h-full overflow-y-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
            <div className={['px-2 pb-4 pt-3 sm:px-4', viewTransitioning ? 'calendar-fade' : ''].join(' ')}>
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, multiMonthPlugin]}
                locales={[esLocale]}
                locale="es"
                initialView={view}
                headerToolbar={false}
                weekends={weekends}
                navLinks
                nowIndicator
                expandRows
                stickyHeaderDates
                height="auto"
                slotDuration="00:30:00"
                slotMinTime="05:00:00"
                slotMaxTime="23:00:00"
                allDaySlot
                selectable
                selectMirror
                editable={false}
                views={{
                  dayGridMonth: { dayMaxEventRows: 5 },
                  multiMonthYear: { type: 'multiMonth', duration: { years: 1 }, multiMonthMaxColumns: 4 },
                }}
                dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
                slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                weekNumberCalculation="ISO"

                events={fcEvents}

                eventClick={(info) => {
                  const raw = info.event.extendedProps?.raw as PreviewRow | undefined;
                  if (!raw) return;
                  setSelected(raw);
                  setOpenPreview(true);
                }}
                dateClick={(arg) => {
                  api()?.changeView('timeGridDay', arg.date);
                  setView('timeGridDay');
                }}
                navLinkDayClick={(date) => {
                  api()?.changeView('timeGridDay', date);
                  setView('timeGridDay');
                }}
                datesSet={({ view: v, start, end }) => {
                  const vtype = v.type as ViewId;
                  const newTitle = v.title;
                  const startMs = start.getTime();
                  const endMs = end.getTime();

                  const last = lastMetaRef.current;
                  const changed =
                    !last ||
                    last.view !== vtype ||
                    last.title !== newTitle ||
                    last.startMs !== startMs ||
                    last.endMs !== endMs;

                  if (!changed) return;

                  setTitle(newTitle);
                  onViewChange?.({ view: vtype, title: newTitle, start, end });
                  setVisibleRange({ start, end });

                  lastMetaRef.current = { view: vtype, title: newTitle, startMs, endMs };
                }}

                eventContent={(arg) => {
                  const timeText = arg.timeText ? `${arg.timeText} ` : '';
                  return (
                    <div className="truncate text-xs font-medium text-[var(--fg)] sm:text-[13px]">
                      <span className="text-[var(--muted)]">{timeText}</span>
                      <span>{arg.event.title}</span>
                    </div>
                  );
                }}
                dayCellDidMount={(info) => {
                  if (info.isToday) info.el.classList.add('fc-is-today-strong');
                }}
              />
            </div>
          </div>
        </div>
        {loading ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center text-xs font-medium text-[var(--muted)]">
            Cargando eventos…
          </div>
        ) : null}
      </div>


      {/* Modal Crear */}
      <CreateEditModal
        open={openCreate}
        mode="create"
        initialTab="evento"
        onSubmit={handleCreateFromModal}
        onClose={() => setOpenCreate(false)}
      />

      {/* Modal Editar */}
      <CreateEditModal
        open={openEdit}
        mode="edit"
        initialTab={editTab}
        initialValues={editInitial ?? undefined}
        onSubmit={handleEditFromModal}
        onClose={() => {
          setOpenEdit(false);
          setEditingId(null);
        }}
      />

      <IcsImportModal
        open={openImport}
        onClose={() => setOpenImport(false)}
        onImported={async () => { await loadEvents(); }}
      />

      {/* Vista previa */}
      <EventPreviewModal
        open={openPreview}
        event={selected}
        deleting={deleting}
        onClose={() => { setOpenPreview(false); setSelected(null); }}
        onEdit={(e) => {
          setOpenPreview(false);
          setEditingId(e.id);
          const initial = mapRowToEditInitial(e, browserTimeZone);
          setEditInitial(initial);
          if (initial?.kind === 'RECORDATORIO') {
            setEditTab('recordatorio');
          } else {
            setEditTab('evento');
          }
          setOpenEdit(true);
        }}
        onDelete={(e) => { void handleDelete(e); }}
      />
    </div>
  );
}
