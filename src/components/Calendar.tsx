'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import type { EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import multiMonthPlugin from '@fullcalendar/multimonth';
import esLocale from '@fullcalendar/core/locales/es';

import { CalendarX2 } from 'lucide-react';

import CreateEditModal, { type CreateModalSubmitPayload } from '@/components/create/Modal';
import EventPreviewModal, { type EventRow as PreviewRow } from '@/components/EventPreviewModal';
import OptionalEventsPanel from '@/components/OptionalEventsPanel';
import AvailableSlots, { type AvailableSlot } from '@/components/AvailableSlots';
import DayActionsModal from '@/components/DayActionsModal';
import SolverChangesPanel, { type SolverChanges } from '@/components/SolverChangesPanel';
import CollaborativeSidebar from '@/components/collaborative/CollaborativeSidebar';
import ReserveSpaceModal from '@/components/ReserveSpaceModal';
import { useToast } from '@/components/ui/ToastProvider';
import type { ValidatedSolverOutput } from '@/domain/solver-contract';

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
  isoToDate,
  resolveBrowserTimezone,
} from '@/lib/timezone';
import {
  buildWaitlistGroups,
  KIND_LABELS,
  WAITLIST_WINDOW_LABELS,
  type EventRow,
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

type ModalInitial = ModalInitialEvent | ModalInitialReminder;

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

  // Estado para conflictos de eventos críticos
  const [criticalConflict, setCriticalConflict] = useState<{
    pendingPayload: CreateModalSubmitPayload;
    conflictingEvents: Array<{ id: string; title: string; start: string; end: string }>;
  } | null>(null);

  const [openOptionalPanel, setOpenOptionalPanel] = useState(false);
  const [openDayActions, setOpenDayActions] = useState(false);
  const [dayActionsDate, setDayActionsDate] = useState<Date>(new Date());
  const [showCompleted, setShowCompleted] = useState(true);

  // ID del usuario actual (para colaborativos)
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [openCollaborative, setOpenCollaborative] = useState(false);

  // Solver changes panel state
  const [solverOutput, setSolverOutput] = useState<ValidatedSolverOutput | null>(null);
  const [solverChanges, setSolverChanges] = useState<SolverChanges | null>(null);
  const [solvingAgenda, setSolvingAgenda] = useState(false);
  const [acceptingChanges, setAcceptingChanges] = useState(false);

  // Vista previa
  const [openPreview, setOpenPreview] = useState(false);
  const [selected, setSelected] = useState<PreviewRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // datos del backend y rango visible
  const [rows, setRows] = useState<EventRow[]>([]);

  // Evento seleccionado sincronizado con rows: refleja el estado más reciente sin cerrar el modal.
  const selectedEvent = useMemo<PreviewRow | null>(() => {
    if (!selected) return null;
    const fresh = rows.find((r) => r.id === selected.id);
    return fresh ? (fresh as unknown as PreviewRow) : selected;
  }, [selected, rows]);
  const [loading, setLoading] = useState(false);
  const [phantomBlocks, setPhantomBlocks] = useState<Array<{ id: string; collabEventId?: string | null; start: string; end: string; title?: string | null }>>([]);
  const [reservations, setReservations] = useState<Array<{ id: string; title: string | null; start: string | null; end: string | null; isRecurring: boolean; dayOfWeek: number | null; startTime: string | null; endTime: string | null }>>([]);
  const [openReserveSpace, setOpenReserveSpace] = useState(false);
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
  const [userDayStart, setUserDayStart] = useState(DEFAULT_USER_SETTINGS.dayStart);
  const [userDayEnd, setUserDayEnd] = useState(DEFAULT_USER_SETTINGS.dayEnd);

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

  useEffect(() => {
    loadEvents();
    loadPhantomBlocks();
    loadReservations();
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((data: { id?: string } | null) => { if (data?.id) setCurrentUserId(data.id); })
      .catch(() => {});
  }, []);

  async function loadPhantomBlocks() {
    try {
      const res = await fetch('/api/collaborative/phantom', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setPhantomBlocks(Array.isArray(data) ? data : []);
    } catch {
      // fallo silencioso — los bloques fantasma son auxiliares
    }
  }

  async function loadReservations() {
    try {
      const res = await fetch('/api/reservations', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as { reservations: typeof reservations };
      setReservations(data.reservations ?? []);
    } catch {
      // fallo silencioso
    }
  }

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
        setUserDayStart(data.dayStart);
        setUserDayEnd(data.dayEnd);

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

  /** Slots libres de la semana actual (horas completas, max 8). */
  const availableSlots = useMemo<AvailableSlot[]>(() => {
    const { hour: startHour } = timeStringToParts(userDayStart);
    const { hour: endHour } = timeStringToParts(userDayEnd);
    if (endHour <= startHour) return [];

    // Eventos que bloquean capacidad (excluye opcionales, recordatorios y waitlist)
    const blocking = rows.filter(
      (r) =>
        r.start &&
        r.end &&
        r.priority !== 'OPCIONAL' &&
        r.priority !== 'RECORDATORIO' &&
        r.status !== 'WAITLIST',
    );

    const result: AvailableSlot[] = [];
    const today = new Date();
    // Lunes de la semana actual
    const monday = new Date(today);
    const jsDay = today.getDay(); // 0=Dom
    const offsetToMonday = jsDay === 0 ? -6 : 1 - jsDay;
    monday.setDate(today.getDate() + offsetToMonday);
    monday.setHours(0, 0, 0, 0);

    const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    for (let d = 0; d < 7 && result.length < 8; d++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + d);

      const jsWeekday = day.getDay(); // 0=Dom
      const dayCode = JS_DAY_TO_DAY_CODE[jsWeekday];
      if (!enabledDayCodes.includes(dayCode)) continue;
      // No mostrar slots pasados (hoy hacia adelante)
      if (day < today && day.toDateString() !== today.toDateString()) continue;

      const dayLabel = `${DAY_NAMES[jsWeekday]} ${day.getDate()} ${monthNames[day.getMonth()]}`;

      for (let h = startHour; h < endHour && result.length < 8; h++) {
        const slotStart = new Date(day);
        slotStart.setHours(h, 0, 0, 0);
        // No mostrar slots que ya pasaron
        if (slotStart < new Date()) continue;

        const slotEnd = new Date(day);
        slotEnd.setHours(h + 1, 0, 0, 0);
        if (slotEnd.getHours() > endHour) continue;

        const slotStartMs = slotStart.getTime();
        const slotEndMs = slotEnd.getTime();

        const isFree = blocking.every((r) => {
          const evStart = new Date(r.start!).getTime();
          const evEnd = new Date(r.end!).getTime();
          return evEnd <= slotStartMs || evStart >= slotEndMs;
        });

        if (isFree) result.push({ start: slotStart, end: slotEnd, dayLabel });
      }
    }

    return result;
  }, [rows, enabledDayCodes, userDayStart, userDayEnd]);

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
  async function handleCreateFromModal(payload: CreateModalSubmitPayload, forceOverlap = false) {
    try {
      setCreating(true);
      const body = forceOverlap ? { ...payload, forceOverlap: true } : payload;
      const res = await fetch('/api/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (res.status === 409) {
        const conflictData = await res.json().catch(() => ({}));
        if (conflictData.conflict) {
          setCriticalConflict({
            pendingPayload: payload,
            conflictingEvents: conflictData.conflictingEvents ?? [],
          });
          return;
        }
        throw new Error(conflictData.error || 'Conflicto de horario');
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'No se pudo crear');
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

      // Ejecutar solver automáticamente para eventos URGENTE/RELEVANTE
      if (payload.kind === 'EVENTO' && (payload.priority === 'URGENTE' || payload.priority === 'RELEVANTE')) {
        await handleSolveAgenda();
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al crear';
      toast(message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleFixed(eventId: string) {
    try {
      const event = rows.find((r) => r.id === eventId);
      if (!event) return;
      const res = await fetch(`/api/events?id=${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFixed: !event.isFixed }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar');
      await loadEvents();
    } catch {
      toast('No se pudo actualizar el evento.', 'error');
    }
  }

  async function handleToggleCompleted(eventId: string) {
    try {
      const event = rows.find((r) => r.id === eventId);
      if (!event) return;
      const res = await fetch(`/api/events?id=${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed: true,
          completedAt: new Date().toISOString(),
          isFixed: true,
          status: 'COMPLETED',
        }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar');
      await loadEvents();
    } catch {
      toast('No se pudo actualizar el evento.', 'error');
    }
  }

  /** Enriquece el output del solver con títulos y fromEnd/toEnd desde rows */
  function enrichSolverOutput(output: ValidatedSolverOutput): SolverChanges {
    const rowMap = new Map(rows.map((r) => [r.id, r]));

    const placed = output.placed.map((p) => {
      const row = rowMap.get(p.id);
      return {
        id: p.id,
        title: row?.title ?? p.id,
        start: p.start,
        end: p.end,
      };
    });

    const moved = output.moved.map((m) => {
      const row = rowMap.get(m.id);
      const fromStartMs = m.fromStart ? new Date(m.fromStart).getTime() : null;
      const fromEndMs = row?.end ? new Date(row.end).getTime() : null;
      const toStartMs = new Date(m.toStart).getTime();
      const duration = fromStartMs != null && fromEndMs != null ? fromEndMs - fromStartMs : 60 * 60 * 1000;
      const toEndMs = toStartMs + duration;

      return {
        id: m.id,
        title: row?.title ?? m.id,
        fromStart: m.fromStart,
        fromEnd: row?.end ?? null,
        toStart: m.toStart,
        toEnd: new Date(toEndMs).toISOString(),
        reason: m.reason,
      };
    });

    const unplaced = output.unplaced.map((u) => {
      const row = rowMap.get(u.id);
      return {
        id: u.id,
        title: row?.title ?? u.id,
        reason: u.reason,
      };
    });

    return { placed, moved, unplaced };
  }

  async function handleSolveAgenda() {
    try {
      setSolvingAgenda(true);
      const res = await fetch('/api/schedule/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Error al optimizar');
      }
      const output = (await res.json()) as ValidatedSolverOutput;
      // Solo mostrar el panel si hay eventos que se deben mover
      if (output.moved && output.moved.length > 0) {
        setSolverOutput(output);
        setSolverChanges(enrichSolverOutput(output));
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al optimizar';
      toast(message, 'error');
    } finally {
      setSolvingAgenda(false);
    }
  }

  async function handleAcceptSolverChanges() {
    if (!solverOutput) return;
    try {
      setAcceptingChanges(true);
      const res = await fetch('/api/schedule/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(solverOutput),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Error al aplicar cambios');
      }
      setSolverOutput(null);
      setSolverChanges(null);
      toast('Cambios aplicados correctamente.', 'success');
      await loadEvents();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al aplicar cambios';
      toast(message, 'error');
    } finally {
      setAcceptingChanges(false);
    }
  }

  function handleCancelSolverChanges() {
    setSolverOutput(null);
    setSolverChanges(null);
  }

  function handleOpenDayActions(date: Date) {
    setDayActionsDate(date);
    setOpenDayActions(true);
  }

  const handleSlotClick = (start: Date, end: Date) => {
    setCreateInitial({
      kind: 'EVENTO',
      title: '',
      description: '',
      category: '',
      priority: 'RELEVANTE',
      repeat: 'NONE',
      window: 'NONE',
      date: dateToDateStringLocal(start, browserTimeZone),
      timeStart: dateToTimeStringLocal(start, browserTimeZone),
      timeEnd: dateToTimeStringLocal(end, browserTimeZone),
      durationHours: '1',
    });
    setOpenCreate(true);
  };

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

  return {
    kind: 'EVENTO',
    title: row.title,
    description: row.description ?? '',
    category: row.category ?? '',
    priority: (row.priority ?? 'RELEVANTE') as PriorityCode,
    repeat: 'NONE',
    window: 'NONE',
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
        if (row.status === 'COMPLETED') {
          if (!showCompleted) continue;
          classNames.push('event-completed');
        }

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
          } else if (p === 'RECORDATORIO') {
            // Recordatorio de punto: start == end o sin end → dot visual
            const isPoint = !endStr || endStr === startStr;
            if (isPoint) {
              // Asignar 30 min de duración visual para que aparezca en el calendario
              const startMs = new Date(startStr).getTime();
              const displayEnd = new Date(startMs + 30 * 60 * 1000).toISOString();
              out.push({
                id: row.id,
                title: row.title,
                start: startStr,
                end: displayEnd,
                classNames: [...classNames, 'reminder-point'],
                color: labelColors[p],
                textColor: labelFgs[p],
                extendedProps: { kind, priority: row.priority, raw: row },
              });
            } else {
              // Recordatorio de rango: semi-transparente, se superpone
              out.push({
                id: row.id,
                title: row.title,
                start: startStr,
                end: endStr,
                classNames: [...classNames, 'reminder-range'],
                color: labelColors[p],
                textColor: labelFgs[p],
                extendedProps: { kind, priority: row.priority, raw: row },
              });
            }
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

    // Bloques fantasma: colaborativos o manuales (borde punteado, fondo rayado)
    for (const phantom of phantomBlocks) {
      const isManual = !phantom.collabEventId;
      const defaultTitle = isManual ? 'Espacio reservado' : 'Reservado (colaborativo)';
      out.push({
        id: `phantom_${phantom.id}`,
        title: phantom.title ?? defaultTitle,
        start: phantom.start,
        end: phantom.end,
        classNames: ['phantom-block'],
        editable: false,
        extendedProps: { isPhantom: true, isManualPhantom: isManual, phantomId: phantom.id, collabEventId: phantom.collabEventId },
      });
    }

    // Reservaciones puntuales → bloques de fondo con patrón rayado
    for (const r of reservations) {
      if (!r.isRecurring && r.start && r.end) {
        out.push({
          id: `reservation_onetime_${r.id}`,
          title: r.title ?? 'Reservación',
          start: r.start,
          end: r.end,
          classNames: ['reservation-block'],
          editable: false,
          extendedProps: { isReservation: true, reservationId: r.id },
        });
      }
      // Recurrentes: FullCalendar no soporta reglas de recurrencia por dayOfWeek directamente,
      // así que las expandimos para el rango visible
      if (r.isRecurring && r.dayOfWeek != null && r.startTime && r.endTime && visibleRange) {
        const cursor = new Date(visibleRange.start);
        cursor.setHours(0, 0, 0, 0);
        const [sh, sm] = r.startTime.split(':').map(Number);
        const [eh, em] = r.endTime.split(':').map(Number);
        while (cursor <= visibleRange.end) {
          if (cursor.getDay() === r.dayOfWeek) {
            const start = new Date(cursor);
            start.setHours(sh ?? 0, sm ?? 0, 0, 0);
            const end = new Date(cursor);
            end.setHours(eh ?? 0, em ?? 0, 0, 0);
            if (end <= start) end.setDate(end.getDate() + 1);
            const dateKey = cursor.toISOString().slice(0, 10);
            out.push({
              id: `reservation_rec_${r.id}_${dateKey}`,
              title: r.title ?? 'Reservación',
              start: start.toISOString(),
              end: end.toISOString(),
              classNames: ['reservation-block'],
              editable: false,
              extendedProps: { isReservation: true, reservationId: r.id },
            });
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    return out;
  }, [rows, visibleRange, theme, disabledJsDayIndexes, phantomBlocks, reservations, showCompleted]);

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

            <div className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 text-sm font-medium text-[var(--muted)] shadow-sm">
              <span>Completados</span>
              <label className="relative inline-flex h-6 w-11 items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={showCompleted}
                  onChange={(e) => setShowCompleted(e.target.checked)}
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
              className="inline-flex items-center rounded-full border border-slate-200/70 bg-white/70 px-5 py-2 text-sm font-semibold text-[var(--fg)] shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
              onClick={() => handleOpenDayActions(new Date())}
              type="button"
              title="Ver lista de eventos de hoy"
            >
              Lista del día
            </button>
<button
              className="inline-flex items-center rounded-full border border-slate-200/70 bg-white/70 px-5 py-2 text-sm font-semibold text-[var(--fg)] shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
              onClick={() => setOpenReserveSpace(true)}
              type="button"
              title="Reservar un bloque de tiempo en tu agenda"
            >
              Reservar espacio
            </button>
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
              className="inline-flex items-center rounded-full border border-indigo-200/70 bg-indigo-50/70 px-5 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-100"
              onClick={() => setOpenCollaborative(true)}
              type="button"
              title="Ver eventos colaborativos y solicitudes"
            >
              Colaborativos
            </button>
          </div>
        </div>
      </header>

      {solverChanges && (
        <SolverChangesPanel
          isVisible={!!solverChanges}
          changes={solverChanges}
          onAccept={handleAcceptSolverChanges}
          onCancel={handleCancelSolverChanges}
          accepting={acceptingChanges}
        />
      )}

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
                  dayHeaderContent={(arg) => {
                    return (
                      <div className="flex flex-col items-center gap-0.5">
                        <span>{arg.text}</span>
                      </div>
                    );
                  }}
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
                    // En vista mes/año: navegar al día. En vista día/semana: abrir crear evento
                    if (view === 'dayGridMonth' || view === 'multiMonthYear') {
                      api()?.changeView('timeGridDay', arg.date);
                      setView('timeGridDay');
                      return;
                    }
                    // Redondear minutos al múltiplo de 5 más cercano
                    const d = arg.date;
                    const roundedMin = Math.round(d.getMinutes() / 5) * 5;
                    const start = new Date(d);
                    start.setMinutes(roundedMin, 0, 0);
                    const end = new Date(start.getTime() + 30 * 60 * 1000);
                    waitlistPromoteRef.current = null;
                    setWaitlistPromotingId(null);
                    setCreateInitial({
                      kind: 'EVENTO',
                      title: '',
                      description: '',
                      category: '',
                      priority: 'RELEVANTE',
                      repeat: 'NONE',
                      window: 'NONE',
                      date: dateToDateStringLocal(start, browserTimeZone),
                      timeStart: dateToTimeStringLocal(start, browserTimeZone),
                      timeEnd: dateToTimeStringLocal(end, browserTimeZone),
                      durationHours: '0',
                    });
                    setOpenCreate(true);
                  }}
                  navLinkDayClick={(date) => {
                    handleOpenDayActions(date);
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
                    const isPoint = arg.event.classNames.includes('reminder-point');
                    if (isPoint) {
                      return (
                        <div className="flex items-center gap-1 truncate text-xs font-medium">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-current opacity-80" />
                          <span className="truncate">{arg.event.title}</span>
                        </div>
                      );
                    }
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
          {/* Slots disponibles */}
          <div className="border-t border-slate-200/70 px-4 py-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-[var(--fg)]">Horas libres esta semana</h3>
              <p className="text-xs text-[var(--muted)]">Haz clic para crear un evento</p>
            </div>
            <AvailableSlots
              slots={availableSlots}
              onSlotClick={handleSlotClick}
              maxVisible={8}
            />
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

      {/* Modal lista del día */}
      <DayActionsModal
        isOpen={openDayActions}
        date={dayActionsDate}
        events={rows
          .filter((r) => {
            if (!r.start) return false;
            const evDate = new Date(r.start);
            return evDate.toDateString() === dayActionsDate.toDateString();
          })
          .map((r) => ({
            id: r.id,
            title: r.title,
            start: r.start ? new Date(r.start) : new Date(),
            end: r.end ? new Date(r.end) : null,
            priority: r.priority ?? 'RELEVANTE',
            category: r.category ?? null,
            isFixed: !!(r as EventRow & { isFixed?: boolean }).isFixed,
            completed: r.status === 'COMPLETED',
          }))}
        onClose={() => setOpenDayActions(false)}
        onEdit={(id) => {
          setOpenDayActions(false);
          const row = rows.find((r) => r.id === id);
          if (!row) return;
          const initial = mapRowToEditInitial(row, browserTimeZone);
          setEditInitial(initial);
          setEditingId(id);
          setEditTab(initial?.kind === 'RECORDATORIO' ? 'recordatorio' : 'evento');
          setOpenEdit(true);
        }}
        onDelete={async (id) => {
          const row = rows.find((r) => r.id === id);
          if (!row) return;
          setOpenDayActions(false);
          await handleDelete(row as PreviewRow);
        }}
        onToggleFixed={handleToggleFixed}
        onToggleCompleted={handleToggleCompleted}
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
        event={selectedEvent}
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
        onToggleFixed={(id) => { void handleToggleFixed(id); }}
        onToggleCompleted={(id) => { void handleToggleCompleted(id); }}
      />

      {/* Panel de colaborativos */}
      <CollaborativeSidebar
        isOpen={openCollaborative}
        onClose={() => setOpenCollaborative(false)}
        availableSlots={availableSlots}
        currentUserId={currentUserId}
      />

      {/* Diálogo de conflicto de evento crítico */}
      {criticalConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setCriticalConflict(null)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-slate-900">Solapamiento con evento crítico</h2>
            <p className="mb-3 text-sm text-slate-700">
              Este horario se solapa con los siguientes eventos críticos:
            </p>
            <ul className="mb-4 space-y-1">
              {criticalConflict.conflictingEvents.map((ev) => (
                <li key={ev.id} className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <span className="font-medium">{ev.title}</span>{' '}
                  <span className="text-rose-600">
                    ({new Date(ev.start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} –{' '}
                    {new Date(ev.end).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })})
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                onClick={async () => {
                  const payload = criticalConflict.pendingPayload;
                  setCriticalConflict(null);
                  await handleCreateFromModal(payload, true);
                }}
              >
                Sobreponer de todos modos
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setCriticalConflict(null)}
              >
                Cambiar horario
              </button>
            </div>
          </div>
        </div>
      )}

      <ReserveSpaceModal
        open={openReserveSpace}
        onClose={() => setOpenReserveSpace(false)}
        onCreated={() => { setOpenReserveSpace(false); loadReservations(); }}
      />
    </div>
  );
}
