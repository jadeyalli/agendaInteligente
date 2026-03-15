'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import type { EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import multiMonthPlugin from '@fullcalendar/multimonth';
import esLocale from '@fullcalendar/core/locales/es';

import { CalendarX2, Download } from 'lucide-react';

import CreateEditModal, { type CreateModalSubmitPayload } from '@/components/create/Modal';
import IcsImportModal from '@/components/ics/IcsImportModal';
import EventPreviewModal, { type EventRow as PreviewRow } from '@/components/EventPreviewModal';
import OptionalEventsPanel from '@/components/OptionalEventsPanel';
import { useToast } from '@/components/ui/ToastProvider';

import { THEMES, currentTheme } from '@/theme/themes';
import {
  DEFAULT_USER_SETTINGS,
  JS_DAY_TO_DAY_CODE,
  dayCodesToWeekdayIndexes,
  hhmmToFullCalendar,
  timeStringToParts,
  type DayCode,
  type UserSettingsValues,
} from '@/lib/user-settings';
import {
  dateToDateStringLocal,
  dateToTimeStringLocal,
  debugDateFull,
  isoToDate,
  resolveBrowserTimezone,
} from '@/lib/timezone';
import {
  buildWaitlistGroups,
  KIND_LABELS,
  WAITLIST_CATEGORY_ORDER,
  WAITLIST_WINDOW_LABELS,
  type EventRow,
  type WaitlistGroup,
} from '@/lib/waitlist-utils';

export type ViewId = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'multiMonthYear';
export type CalendarMeta = { view: ViewId; title: string; start: Date; end: Date };
export type CalendarProps = { onViewChange?: (meta: CalendarMeta) => void };

type PriorityCode = 'CRITICA' | 'URGENTE' | 'RELEVANTE' | 'OPCIONAL' | 'RECORDATORIO';

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
  durationHours: string;
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

type ModalInitialTask = {
  kind: 'TAREA';
  title: string;
  description: string;
  category: string;
  priority: PriorityCode;
  repeat: 'NONE';
  date: string;
};

type ModalInitial = ModalInitialEvent | ModalInitialTask | ModalInitialReminder;

export default function Calendar({ onViewChange }: CalendarProps) {
  const { toast } = useToast();

  // === tema (escucha cambios emitidos por la página) ===
  const [theme, setTheme] = useState(currentTheme());
  useEffect(() => {
    const onChange = () => setTheme(currentTheme());
    window.addEventListener('ai-theme-change', onChange);
    return () => window.removeEventListener('ai-theme-change', onChange);
  }, []);

  // === estado calendario ===
  const [view, setView] = useState<ViewId>('timeGridWeek');
  const [weekends, setWeekends] = useState(
    DEFAULT_USER_SETTINGS.enabledDays.some((d) => d === 'sat' || d === 'sun'),
  );
  const [title, setTitle] = useState<string>('');
  const [viewTransitioning, setViewTransitioning] = useState(false);

  const [openCreate, setOpenCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createInitial, setCreateInitial] = useState<ModalInitialEvent | null>(null);
  const [waitlistPromotingId, setWaitlistPromotingId] = useState<string | null>(null);

  const [openEdit, setOpenEdit] = useState(false);
  const [editInitial, setEditInitial] = useState<ModalInitial | null>(null);
  const [editTab, setEditTab] = useState<'evento' | 'recordatorio'>('evento');
  const browserTimeZone = useMemo(() => resolveBrowserTimezone(), []);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [openImport, setOpenImport] = useState(false);
  const [openOptionalPanel, setOpenOptionalPanel] = useState(false);

  // Vista previa
  const [openPreview, setOpenPreview] = useState(false);
  const [selected, setSelected] = useState<PreviewRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // datos del backend y rango visible
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | null>(null);
  const [enabledDayCodes, setEnabledDayCodes] = useState<DayCode[]>(
    DEFAULT_USER_SETTINGS.enabledDays,
  );

  const defaultStartParts = timeStringToParts(DEFAULT_USER_SETTINGS.dayStart);
  const defaultEndParts = timeStringToParts(DEFAULT_USER_SETTINGS.dayEnd);
  const defaultRangeValid =
    defaultEndParts.hour > defaultStartParts.hour ||
    (defaultEndParts.hour === defaultStartParts.hour && defaultEndParts.minute > defaultStartParts.minute);
  const [slotMinTime, setSlotMinTime] = useState<string>(
    defaultRangeValid ? hhmmToFullCalendar(DEFAULT_USER_SETTINGS.dayStart) : '00:00:00',
  );
  const [slotMaxTime, setSlotMaxTime] = useState<string>(
    defaultRangeValid ? hhmmToFullCalendar(DEFAULT_USER_SETTINGS.dayEnd) : '24:00:00',
  );

  const calendarRef = useRef<FullCalendar | null>(null);
  const api = () => calendarRef.current?.getApi();
  const waitlistPromoteRef = useRef<EventRow | null>(null);

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
      const res = await fetch('/api/events', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error('No se pudieron cargar los eventos');
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      // fallo silencioso en cliente; el empty state ya comunica la ausencia de datos
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEvents(); }, []);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (!res.ok) throw new Error('No se pudieron cargar las preferencias');
        const data = (await res.json()) as UserSettingsValues;

        const startParts = timeStringToParts(data.dayStart);
        const endParts = timeStringToParts(data.dayEnd);
        const hasValidRange =
          endParts.hour > startParts.hour ||
          (endParts.hour === startParts.hour && endParts.minute > startParts.minute);

        setSlotMinTime(hasValidRange ? hhmmToFullCalendar(data.dayStart) : '00:00:00');
        setSlotMaxTime(hasValidRange ? hhmmToFullCalendar(data.dayEnd) : '24:00:00');

        const enabledCodes = Array.isArray(data.enabledDays)
          ? (data.enabledDays as DayCode[])
          : DEFAULT_USER_SETTINGS.enabledDays;
        setEnabledDayCodes(enabledCodes);

        const hasWeekend = enabledCodes.some((code) => code === 'sat' || code === 'sun');
        setWeekends(Boolean(hasWeekend));
      } catch (err) {
        console.error('Error cargando configuración', err);
      }
    }

    loadSettings();
  }, []);

  const disabledWeekdayIndexes = useMemo(() => {
    const enabledIndexes = new Set(dayCodesToWeekdayIndexes(enabledDayCodes));
    const disabled: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      if (!enabledIndexes.has(i)) {
        disabled.push(i);
      }
    }
    return disabled;
  }, [enabledDayCodes]);

  const disabledJsDayIndexes = useMemo(() => {
    if (!disabledWeekdayIndexes.length) return [] as number[];
    const disabledSet = new Set(disabledWeekdayIndexes);
    const jsIndexes: number[] = [];
    JS_DAY_TO_DAY_CODE.forEach((code, jsIndex) => {
      if (!code) return;
      const weekdayIndex = dayCodesToWeekdayIndexes([code as DayCode])[0];
      if (disabledSet.has(weekdayIndex)) {
        jsIndexes.push(jsIndex);
      }
    });
    return jsIndexes;
  }, [disabledWeekdayIndexes]);

  const waitlistGroups = useMemo(() => buildWaitlistGroups(rows), [rows]);

  const optionalEvents = useMemo(
    () => rows.filter((r) => r.priority === 'OPCIONAL'),
    [rows],
  );

  const waitlistTotal = useMemo(
    () => waitlistGroups.reduce((sum, group) => sum + group.events.length, 0),
    [waitlistGroups],
  );

  const waitlistDateFormatter = useMemo(
    () => new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: browserTimeZone }),
    [browserTimeZone],
  );

  const waitlistDateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: browserTimeZone,
      }),
    [browserTimeZone],
  );

  const formatWaitlistDate = (value?: string | null, includeTime = false) => {
    if (!value) return null;
    const date = isoToDate(value);
    if (!date) return null;
    return includeTime ? waitlistDateTimeFormatter.format(date) : waitlistDateFormatter.format(date);
  };

  const formatSuggestedTime = (event: EventRow) => {
    if (!event.start) return null;
    const startDate = isoToDate(event.start);
    if (!startDate) return null;

    if (event.isAllDay) {
      return waitlistDateFormatter.format(startDate);
    }

    const startDateLabel = waitlistDateFormatter.format(startDate);
    const startTimeLabel = dateToTimeStringLocal(startDate, browserTimeZone);

    if (event.end) {
      const endDate = isoToDate(event.end);
      if (endDate) {
        const sameDay = startDate.toDateString() === endDate.toDateString();
        const endTimeLabel = dateToTimeStringLocal(endDate, browserTimeZone);
        if (sameDay && endTimeLabel) {
          return `${startDateLabel} · ${startTimeLabel} – ${endTimeLabel}`;
        }
        return `${waitlistDateTimeFormatter.format(startDate)} – ${waitlistDateTimeFormatter.format(endDate)}`;
      }
    }

    return `${startDateLabel} · ${startTimeLabel}`;
  };

  const formatWindow = (event: EventRow) => {
    const code = event.window && event.window !== 'NONE' ? event.window : null;
    if (!code) return null;
    if (code === 'RANGO') {
      const start = formatWaitlistDate(event.windowStart, false);
      const end = formatWaitlistDate(event.windowEnd, false);
      if (start && end) return `Entre ${start} y ${end}`;
      if (start) return `Desde ${start}`;
      if (end) return `Hasta ${end}`;
    }
    return WAITLIST_WINDOW_LABELS[code];
  };

  const formatDuration = (event: EventRow) => {
    const minutes = typeof event.durationMinutes === 'number' ? event.durationMinutes : null;
    if (!minutes || minutes <= 0) return null;
    if (minutes % 60 === 0) {
      const hours = minutes / 60;
      return `${hours} h`;
    }
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (!remainder) return `${hours} h`;
    return `${hours} h ${remainder} min`;
  };

  // ====== Crear desde el modal ======
  async function handleCreateFromModal(payload: CreateModalSubmitPayload) {
    try {
      setCreating(true);
      const res = await fetch('/api/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo crear');
      }
      const created = await res.json().catch(() => ({ items: [] }));
      const items: Array<{ status?: string; priority?: string }> = Array.isArray(created?.items) ? created.items : [];
      const displaced = created?.displaced as { movedCount?: number; waitlistedCount?: number } | undefined;

      const wentToWaitlist = items.some((ev) => ev.status === 'WAITLIST');
      const isSchedulingPolicy = items.some(
        (ev) => ev.status === 'WAITLIST' && (!ev.priority || ev.priority === 'OPCIONAL'),
      );

      if (wentToWaitlist) {
        if (isSchedulingPolicy) {
          toast('El evento fue a la lista de espera (prioridad Opcional).', 'info', 5000);
        } else {
          toast('No se encontró horario disponible. El evento quedó en lista de espera.', 'warning', 6000);
        }
      } else if (items.length > 0) {
        toast('Evento creado correctamente.', 'success');
      }

      if (displaced) {
        const { movedCount = 0, waitlistedCount = 0 } = displaced;
        if (movedCount > 0 && waitlistedCount > 0) {
          toast(
            `${movedCount} evento${movedCount > 1 ? 's' : ''} reubicado${movedCount > 1 ? 's' : ''} y ${waitlistedCount} en lista de espera por la nueva prioridad.`,
            'info',
            6000,
          );
        } else if (movedCount > 0) {
          toast(
            `${movedCount} evento${movedCount > 1 ? 's' : ''} de menor prioridad ${movedCount > 1 ? 'fueron reubicados' : 'fue reubicado'} automáticamente.`,
            'info',
            5000,
          );
        } else if (waitlistedCount > 0) {
          toast(
            `${waitlistedCount} evento${waitlistedCount > 1 ? 's' : ''} de menor prioridad ${waitlistedCount > 1 ? 'pasaron' : 'pasó'} a lista de espera.`,
            'warning',
            5000,
          );
        }
      }

      const waitlistSource = waitlistPromoteRef.current;
      setOpenCreate(false);
      setCreateInitial(null);
      waitlistPromoteRef.current = null;
      setWaitlistPromotingId(null);
      if (waitlistSource) {
        try {
          const deleteRes = await fetch(`/api/events?id=${encodeURIComponent(waitlistSource.id)}`, {
            method: 'DELETE',
          });
          if (!deleteRes.ok) {
            const err = await deleteRes.json().catch(() => ({}));
            throw new Error(err.error || 'No se pudo eliminar de la lista de espera');
          }
        } catch (deleteError) {
          const message =
            deleteError instanceof Error
              ? deleteError.message
              : 'No se pudo eliminar de la lista de espera';
          toast(message, 'error');
        }
      }
      await loadEvents();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al crear';
      toast(message, 'error');
    } finally {
      setCreating(false);
    }
  }

  const handleScheduleFromOptional = (eventId: string) => {
    const event = rows.find((r) => r.id === eventId);
    if (!event) return;
    setOpenOptionalPanel(false);
    handleScheduleFromWaitlist(event);
  };

  const handleScheduleFromWaitlist = (event: EventRow) => {
    waitlistPromoteRef.current = event;
    setWaitlistPromotingId(event.id);
    const initial = mapWaitlistRowToCreateInitial(event, browserTimeZone);
    setCreateInitial(initial);
    setOpenCreate(true);
  };

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
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo actualizar');
      }
      setOpenEdit(false);
      setEditingId(null);
      toast('Evento actualizado.', 'success');
      await loadEvents();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al actualizar';
      toast(message, 'error');
    } finally {
      setCreating(false);
    }
  }

  // ====== Eliminar ======
  async function handleDelete(e: PreviewRow) {
    try {
      setDeleting(true);
      const res = await fetch(`/api/events?id=${encodeURIComponent(e.id)}`, { method: 'DELETE' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo eliminar');
      }
      setOpenPreview(false);
      setSelected(null);
      toast('Evento eliminado.', 'success');
      await loadEvents();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar';
      toast(message, 'error');
    } finally {
      setDeleting(false);
    }
  }

function mapRowToEditInitial(row: EventRow, timeZone: string): ModalInitial | null {
  const minutesToHourString = (minutes?: number | null) => {
    if (!minutes || minutes <= 0) return '';
    const hours = minutes / 60;
    const rounded = Math.round(hours * 100) / 100;
    return rounded.toString();
  };

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
      isAllDay: !!row.isAllDay,
      date: dateToDateStringLocal(startDate, timeZone),
      timeStart: dateToTimeStringLocal(startDate, timeZone),
      timeEnd: dateToTimeStringLocal(endDate, timeZone),
    };
  }

  // Si es EVENTO
  const startDate = row.start ? isoToDate(row.start) : null;
  const endDate = row.end ? isoToDate(row.end) : null;
  const directDuration = typeof row.durationMinutes === 'number' ? row.durationMinutes : null;
  const inferredDuration = startDate && endDate && endDate > startDate
    ? Math.round((endDate.getTime() - startDate.getTime()) / 60000)
    : null;
  const durationForForm = directDuration && directDuration > 0 ? directDuration : inferredDuration;

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
    durationHours: minutesToHourString(durationForForm) || '1',
  };
}

function mapWaitlistRowToCreateInitial(row: EventRow, timeZone: string): ModalInitialEvent {
  const startDate = row.start ? isoToDate(row.start) : null;
  const endDate = row.end ? isoToDate(row.end) : null;
  const durationMinutes = typeof row.durationMinutes === 'number' ? row.durationMinutes : null;

  const durationHours = (() => {
    if (!durationMinutes || durationMinutes <= 0) return '1';
    const hours = Math.round((durationMinutes / 60) * 100) / 100;
    return hours > 0 ? hours.toString() : '1';
  })();

  return {
    kind: 'EVENTO',
    title: row.title,
    description: row.description ?? '',
    category: row.category ?? '',
    priority: 'RELEVANTE',
    repeat: 'NONE',
    window: 'NONE',
    date: dateToDateStringLocal(startDate, timeZone),
    timeStart: dateToTimeStringLocal(startDate, timeZone),
    timeEnd: dateToTimeStringLocal(endDate, timeZone),
    durationHours,
  };
}
  // ====== Mapeo a FullCalendar con colores del tema ======
  const fcEvents = useMemo<EventInput[]>(() => {
    const out: EventInput[] = [];

    if (rows.length) {
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
            title: row.title,
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
          // Color de prioridad con alpha para el fondo (hex 8 dígitos: #rrggbbaa)
          const winBg = labelColors[p] + '28';   // ~16 % opacidad
          const winBgSoft = labelColors[p] + '14'; // ~8 % opacidad para ventanas suaves
          const winBorder = labelColors[p];

          if (windowCode === 'RANGO' && row.windowStart) {
            const sDay = toDateOnly(row.windowStart)!;
            const eDay = row.windowEnd ? toDateOnly(row.windowEnd)! : undefined;
            out.push({
              id: `${row.id}-win`,
              title: row.title,
              start: sDay,
              end: eDay,
              display: 'background',
              backgroundColor: winBg,
              borderColor: winBorder,
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
              backgroundColor: winBgSoft,
              borderColor: winBorder,
              classNames: ['bg-window-soft'],
              extendedProps: { kind, priority: row.priority, raw: row, isWindow: true, code: windowCode },
            });
          }
        }
      }
    }

    if (visibleRange && disabledJsDayIndexes.length) {
      const disabledSet = new Set(disabledJsDayIndexes);
      if (disabledSet.size) {
        const cursor = new Date(visibleRange.start);
        cursor.setHours(0, 0, 0, 0);
        const end = new Date(visibleRange.end);
        end.setHours(0, 0, 0, 0);

        while (cursor < end) {
          const jsDay = cursor.getDay();
          if (disabledSet.has(jsDay)) {
            const start = new Date(cursor);
            const finish = new Date(cursor);
            finish.setDate(finish.getDate() + 1);
            out.push({
              id: `disabled-${start.toISOString()}`,
              start,
              end: finish,
              display: 'background',
              classNames: ['fc-day-disabled-overlay'],
              allDay: true,
            });
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    return out;
  }, [rows, visibleRange, theme, disabledJsDayIndexes]);

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
              onClick={() => {
                waitlistPromoteRef.current = null;
                setWaitlistPromotingId(null);
                setCreateInitial(null);
                setOpenCreate(true);
              }}
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
            <a
              href="/api/export-ics"
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-5 py-2 text-sm font-semibold text-[var(--fg)] shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar .ICS
            </a>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-[var(--surface)]/90 shadow-sm">
          {!loading && rows.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
              <div className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-4 py-2 shadow-sm">
                <CalendarX2 className="h-4 w-4 shrink-0 text-slate-400" />
                <p className="text-sm text-slate-500">Sin eventos — crea uno o importa un .ICS</p>
              </div>
            </div>
          )}
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
                  slotMinTime={slotMinTime}
                  slotMaxTime={slotMaxTime}
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
                  eventDidMount={(info) => {
                    // Los background events (ventanas) no disparan eventClick de FullCalendar,
                    // así que agregamos el listener manualmente al elemento DOM.
                    const { isWindow, raw } = info.event.extendedProps ?? {};
                    if (!isWindow || !raw) return;
                    const el = info.el;
                    el.style.cursor = 'pointer';
                    el.title = (raw as PreviewRow).title ?? '';
                    const handler = () => {
                      setSelected(raw as PreviewRow);
                      setOpenPreview(true);
                    };
                    el.addEventListener('click', handler);
                    // Cleanup al desmontar el elemento
                    return () => el.removeEventListener('click', handler);
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

        <aside
          id="waitlist"
          className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-[var(--surface)]/90 shadow-sm"
        >
          <div className="border-b border-slate-200/70 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--fg)]">Lista de espera</h2>
                <p className="text-xs text-[var(--muted)]">Eventos opcionales listos para agendar</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700">
                {waitlistTotal}
              </span>
            </div>
          </div>
          <div
            className="flex-1 overflow-y-auto px-4 py-4"
            style={{ maxHeight: 'calc(100vh - 240px)' }}
          >
            {waitlistTotal === 0 ? (
              <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-center text-sm text-[var(--muted)]">
                <p>No hay eventos opcionales en la lista de espera.</p>
                <p className="text-xs">
                  Cuando agregues sugerencias opcionales, aparecerán aquí para agendarlas rápidamente.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {waitlistGroups.flatMap((g) => g.events).slice(0, 4).map((event) => {
                  const suggestion = formatSuggestedTime(event);
                  const windowText = formatWindow(event);
                  const durationText = formatDuration(event);
                  const kindLabel = KIND_LABELS[event.kind] ?? event.kind;
                  const isActive = waitlistPromotingId === event.id;
                  const isPromoting = creating && isActive;
                  return (
                    <article
                      key={event.id}
                      className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                            <span className="inline-flex items-center rounded-full bg-slate-900/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                              {kindLabel}
                            </span>
                            <span className="text-indigo-500">Opcional</span>
                          </div>
                          <h4 className="text-sm font-semibold text-[var(--fg)]">{event.title}</h4>
                          {event.description ? (
                            <p className="text-xs text-[var(--muted)]">{event.description}</p>
                          ) : null}
                          <dl className="space-y-1 text-xs text-[var(--muted)]">
                            {suggestion ? (
                              <div>
                                <dt className="sr-only">Sugerencia</dt>
                                <dd>{suggestion}</dd>
                              </div>
                            ) : null}
                            {windowText ? (
                              <div>
                                <dt className="sr-only">Ventana sugerida</dt>
                                <dd>Ventana: {windowText}</dd>
                              </div>
                            ) : null}
                            {durationText ? (
                              <div>
                                <dt className="sr-only">Duración estimada</dt>
                                <dd>Duración: {durationText}</dd>
                              </div>
                            ) : null}
                          </dl>
                        </div>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => handleScheduleFromWaitlist(event)}
                          disabled={creating || isActive}
                        >
                          {isPromoting ? 'Agendando…' : isActive ? 'Configurando…' : 'Agendar'}
                        </button>
                      </div>
                    </article>
                  );
                })}
                {waitlistTotal > 4 && (
                  <button
                    type="button"
                    onClick={() => setOpenOptionalPanel(true)}
                    className="flex w-full items-center justify-center gap-1 rounded-2xl border border-slate-200/70 py-2.5 text-xs font-medium text-[var(--muted)] transition hover:border-slate-300 hover:text-[var(--fg)]"
                  >
                    Ver todos ({waitlistTotal}) →
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>


      {/* Modal Crear */}
      <CreateEditModal
        open={openCreate}
        mode="create"
        initialTab="evento"
        initialValues={createInitial ?? undefined}
        onSubmit={handleCreateFromModal}
        onClose={() => {
          setOpenCreate(false);
          setCreateInitial(null);
          waitlistPromoteRef.current = null;
          setWaitlistPromotingId(null);
        }}
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

      {/* Panel de eventos opcionales */}
      <OptionalEventsPanel
        events={optionalEvents}
        onScheduleEvent={handleScheduleFromOptional}
        isOpen={openOptionalPanel}
        onToggle={() => setOpenOptionalPanel((v) => !v)}
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
