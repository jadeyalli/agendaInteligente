'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import multiMonthPlugin from '@fullcalendar/multimonth';
import esLocale from '@fullcalendar/core/locales/es';
import CreateEditModal from '@/components/create/Modal';
import IcsImportModal from '@/components/ics/IcsImportModal';


export type ViewId = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'multiMonthYear';
export type CalendarMeta = { view: ViewId; title: string; start: Date; end: Date };

export type CalendarProps = {
  onViewChange?: (meta: CalendarMeta) => void;
};

type EventRow = {
  id: string;
  kind: 'EVENTO' | 'TAREA' | 'SOLICITUD';
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: string | null;

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

export default function Calendar({ onViewChange }: CalendarProps) {
  const [view, setView] = useState<ViewId>('timeGridWeek');
  const [weekends, setWeekends] = useState(true);
  const [title, setTitle] = useState<string>('');
  const [openCreate, setOpenCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openImport, setOpenImport] = useState(false);

  // datos del backend y rango visible
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | null>(null);

  const calendarRef = useRef<FullCalendar | null>(null);
  const api = () => calendarRef.current?.getApi();

  // evita loops al cambiar vista/rango
  const lastMetaRef = useRef<{ view: ViewId; title: string; startMs: number; endMs: number } | null>(null);

  // Helpers
  const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);

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


  useEffect(() => {
    loadEvents();
  }, []);

  // ====== Crear desde el modal y refrescar ======
  async function handleCreateFromModal(payload: any) {
    try {
      setCreating(true);
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo crear');
      }
      setOpenCreate(false);
      await loadEvents(); // refresca
    } catch (e: any) {
      alert(e.message || 'Error al crear');
    } finally {
      setCreating(false);
    }
  }

  // ====== Mapeo a FullCalendar (incluye ventanas) ======
  // helper: extrae 'YYYY-MM-DD' de un ISO u objeto Date
  const toDateOnly = (d: string | Date | null | undefined) => {
    if (!d) return null;
    const s = typeof d === 'string' ? d : (d as Date).toISOString();
    return s.slice(0, 10); // YYYY-MM-DD
  };

  const fcEvents = useMemo(() => {
    if (!rows.length) return [];
    const out: any[] = [];

    for (const row of rows) {
      const kind = row.kind || 'EVENTO';
      const startStr = row.start || null;
      const endStr = row.end || null;
      const dueStr = row.dueDate || null;
      const windowCode = row.window || 'NONE';

      // 1) Eventos con start/end
      if (startStr) {
        if (row.isAllDay) {
          // 🔵 all-day → usa YYYY-MM-DD para evitar desfases por zona horaria
          const sDay = toDateOnly(startStr)!;
          // FullCalendar espera end EXCLUSIVO en all-day; si viene un end, lo paso a date-only
          const eDay = endStr ? toDateOnly(endStr)! : undefined;
          out.push({
            id: row.id,
            title: row.title,
            start: sDay,
            end: eDay,
            allDay: true,
            extendedProps: { kind, priority: row.priority, raw: row },
          });
        } else {
          out.push({
            id: row.id,
            title: row.title,
            start: startStr,
            end: endStr ?? undefined,
            allDay: !!row.isAllDay,
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
          extendedProps: { kind, priority: row.priority, raw: row },
        });
        continue;
      }

      // 3) Ventanas (si quieres ver “algo” aunque no haya fechas concretas)
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
  }, [rows, visibleRange]);


  // Navegación
  const changeView = (v: ViewId) => { setView(v); api()?.changeView(v); };
  const prev = () => api()?.prev();
  const next = () => api()?.next();
  const today = () => api()?.today();

  // Estilos de botones
  const viewBtn = (active: boolean) =>
    [
      'inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-medium transition',
      active ? 'bg-slate-900 text-white border-slate-900'
        : 'bg-white text-slate-900 border-slate-400 hover:bg-slate-50',
    ].join(' ');
  const navBtn =
    'inline-flex items-center rounded-lg bg-white border border-slate-400 px-3 py-1.5 text-sm text-slate-900 hover:bg-slate-100';
  const arrowBtn =
    'inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition ' +
    'bg-white text-blue-700 border-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40';

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Toolbar */}
        <header className="mb-4 flex flex-col gap-3 sm:mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* IZQUIERDA */}
            <div className="flex items-center gap-3">
              <button className={navBtn} type="button" onClick={today}>Hoy</button>
              <div className="text-base font-semibold text-slate-900">{title || ' '}</div>
            </div>

            {/* DERECHA */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
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
                <span className="text-sm text-slate-700">Fines de semana</span>
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
                className="ml-2 inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-60"
                onClick={() => setOpenCreate(true)}
                type="button"
                disabled={creating}
              >
                {creating ? 'Creando…' : 'Crear'}
              </button>
              <button
                className="ml-2 inline-flex items-center rounded-xl bg-white px-4 py-2 text-blue-700 border border-blue-600 hover:bg-blue-50"
                onClick={() => setOpenImport(true)}
                type="button"
              >
                Importar .ICS
              </button>
            </div>
          </div>
        </header>

        {/* Calendario */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
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
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            allDaySlot
            selectable
            selectMirror
            editable={false}
            views={{
              multiMonthYear: {
                type: 'multiMonth',
                duration: { years: 1 },
                multiMonthMaxColumns: 4,
              },
            }}
            dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            weekNumberCalculation="ISO"

            /* 👇 Ahora usamos la lista ya mapeada (incluye ventanas) */
            events={fcEvents}

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

              // Título + meta para dashboard
              setTitle(newTitle);
              onViewChange?.({ view: vtype, title: newTitle, start, end });
              lastMetaRef.current = { view: vtype, title: newTitle, startMs, endMs };

              // Guardamos el rango visible para pintar ventanas PRONTO/SEMANA/MES
              setVisibleRange({ start, end });
            }}
            eventContent={(arg) => {
              const timeText = arg.timeText ? `${arg.timeText} ` : '';
              return (
                <div className="truncate text-xs sm:text-[13px] font-medium text-slate-800">
                  <span className="text-slate-500">{timeText}</span>
                  <span>{arg.event.title}</span>
                </div>
              );
            }}
            dayCellDidMount={(info) => {
              if (info.isToday) info.el.classList.add('fc-is-today-strong');
            }}
          />
          {loading ? (
            <div className="mt-2 text-sm text-slate-500">Cargando eventos…</div>
          ) : null}
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
      <IcsImportModal
        open={openImport}
        onClose={() => setOpenImport(false)}
        onImported={async (count) => {
          // después de importar, recarga eventos para verlos
          await loadEvents();
        }}
      />
    </div>
  );
}
