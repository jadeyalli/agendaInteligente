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

type ModalInitialTask = {
  kind: 'TAREA';
  title: string;
  description: string;
  category: string;
  repeat: 'NONE';
  dueDate: string;
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
    const dueDate = row.dueDate ? isoToDate(row.dueDate) : null;
    return {
      kind: 'TAREA',
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
  debugDateFull('START en mapRowToEditInitial', startDate, timeZone);
  debugDateFull('END en mapRowToEditInitial', endDate, timeZone);

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
  const changeView = (v: ViewId) => { setView(v); api()?.changeView(v); };
  const prev = () => api()?.prev();
  const next = () => api()?.next();
  const today = () => api()?.today();

  // Estilos botones
  const viewBtn = (active: boolean) =>
    [
      'inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-medium transition',
      active
        ? 'bg-[var(--fg)] text-[var(--bg)] border-[var(--fg)]'
        : 'bg-[var(--surface)] text-[var(--fg)] border-slate-300 hover:bg-slate-100',
    ].join(' ');
  const navBtn =
    'inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition bg-[var(--surface)] text-[var(--fg)] hover:bg-slate-100';
  const arrowBtn =
    'inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition bg-[var(--surface)] text-[var(--fg)] hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Toolbar */}
        <header className="mb-4 flex flex-col gap-3 sm:mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* IZQUIERDA */}
            <div className="flex items-center gap-3">
              <button className={navBtn} type="button" onClick={today}>Hoy</button>
              <div className="text-base font-semibold text-[var(--fg)]">{title || ' '}</div>
            </div>

            {/* DERECHA */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-[var(--fg)]">
                <button className={viewBtn(view === 'timeGridDay')} onClick={() => changeView('timeGridDay')} type="button">Día</button>
                <button className={viewBtn(view === 'timeGridWeek')} onClick={() => changeView('timeGridWeek')} type="button">Semana</button>
                <button className={viewBtn(view === 'dayGridMonth')} onClick={() => changeView('dayGridMonth')} type="button">Mes</button>
                <button className={viewBtn(view === 'multiMonthYear')} onClick={() => changeView('multiMonthYear')} type="button">Año</button>
              </div>

              {/* Flechas */}
              <div className="flex items-center gap-2">
                <button className={arrowBtn} type="button" onClick={prev}>◀</button>
                <button className={arrowBtn} type="button" onClick={next}>▶</button>
              </div>

              {/* Toggle fines de semana */}
              <label className="relative inline-flex select-none items-center gap-2 pl-2">
                <span className="text-sm text-[var(--fg)]">Fines de semana</span>
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={weekends}
                  onChange={(e) => setWeekends(e.target.checked)}
                />
                <span className="relative h-6 w-10 rounded-full bg-slate-300 transition-colors peer-checked:bg-blue-600">
                  <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                </span>
              </label>

              {/* Crear */}
              <button
                className="ml-2 inline-flex items-center rounded-xl bg-[var(--fg)] px-4 py-2 text-[var(--bg)] transition hover:opacity-90 disabled:opacity-60"
                onClick={() => setOpenCreate(true)}
                type="button"
                disabled={creating}
              >
                {creating ? 'Creando…' : 'Crear'}
              </button>
              <button
                className="ml-2 inline-flex items-center rounded-xl border border-slate-300 bg-[var(--surface)] px-4 py-2 text-[var(--fg)] hover:bg-slate-100"
                onClick={() => setOpenImport(true)}
                type="button"
              >
                Importar .ICS
              </button>
            </div>
          </div>
        </header>

        {/* Calendario */}
        <div className="rounded-2xl border border-slate-200 bg-[var(--surface)] p-3 sm:p-4 shadow-sm">
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
                <div className="truncate text-xs sm:text-[13px] font-medium text-[var(--fg)]">
                  <span className="text-[var(--muted)]">{timeText}</span>
                  <span>{arg.event.title}</span>
                </div>
              );
            }}
            dayCellDidMount={(info) => {
              if (info.isToday) info.el.classList.add('fc-is-today-strong');
            }}
          />
          {loading ? <div className="mt-2 text-sm text-[var(--muted)]">Cargando eventos…</div> : null}
        </div>
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
