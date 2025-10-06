'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import NewItemModal, { type EditableEvent, type WindowCode } from '@/components/NewItemModal';
import EventDetailsModal, { type EventDetailsData } from '@/components/EventDetailsModal';
import { PRIORITY_STYLES, type Priority } from '@/lib/priorities';

type CalendarEventExtendedProps = {
  priority: Priority;
  rawEvent: EventDetailsData;
};

const PRIORITY_VALUES: readonly Priority[] = ['CRITICA', 'URGENTE', 'RELEVANTE', 'OPCIONAL'];
const KIND_VALUES: readonly EventDetailsData['kind'][] = ['EVENTO', 'TAREA', 'SOLICITUD'];
const REPEAT_VALUES: readonly EditableEvent['repeat'][] = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const WINDOW_VALUES: readonly WindowCode[] = ['PRONTO', 'SEMANA', 'MES', 'RANGO', 'NONE'];

type EventRecord = Record<string, unknown>;

function normalizeEvent(raw: unknown): EventDetailsData {
  const record: EventRecord = typeof raw === 'object' && raw !== null ? (raw as EventRecord) : {};

  const idValue = record.id;
  const id = typeof idValue === 'string' ? idValue : String(idValue ?? '');

  const kindValue = record.kind;
  const kind = typeof kindValue === 'string' && KIND_VALUES.includes(kindValue as EventDetailsData['kind'])
    ? (kindValue as EventDetailsData['kind'])
    : 'EVENTO';

  const titleValue = record.title;
  const title = typeof titleValue === 'string' && titleValue.trim().length > 0 ? titleValue : 'Sin titulo';

  const descriptionValue = record.description;
  const categoryValue = record.category;
  const startValue = record.start;
  const endValue = record.end;
  const windowValue = record.window;
  const windowStartValue = record.windowStart;
  const windowEndValue = record.windowEnd;
  const durationValue = record.durationMinutes;
  const statusValue = record.status;
  const shareLinkValue = record.shareLink;

  const priorityValue = record.priority;
  const priority = typeof priorityValue === 'string' && PRIORITY_VALUES.includes(priorityValue as Priority)
    ? (priorityValue as Priority)
    : 'RELEVANTE';

  const repeatValue = record.repeat;
  const repeat = typeof repeatValue === 'string' && REPEAT_VALUES.includes(repeatValue as EditableEvent['repeat'])
    ? (repeatValue as EditableEvent['repeat'])
    : 'NONE';

  const windowCode = typeof windowValue === 'string' && WINDOW_VALUES.includes(windowValue as WindowCode)
    ? (windowValue as WindowCode)
    : null;

  return {
    id,
    kind,
    title,
    description: typeof descriptionValue === 'string' ? descriptionValue : null,
    category: typeof categoryValue === 'string' ? categoryValue : null,
    isInPerson: typeof record.isInPerson === 'boolean' ? record.isInPerson : true,
    canOverlap: typeof record.canOverlap === 'boolean' ? record.canOverlap : false,
    priority,
    repeat,
    start: typeof startValue === 'string' ? startValue : null,
    end: typeof endValue === 'string' ? endValue : null,
    window: windowCode,
    windowStart: typeof windowStartValue === 'string' ? windowStartValue : null,
    windowEnd: typeof windowEndValue === 'string' ? windowEndValue : null,
    durationMinutes: typeof durationValue === 'number' ? durationValue : null,
    status: typeof statusValue === 'string' ? statusValue : '',
    shareLink: typeof shareLinkValue === 'string' ? shareLinkValue : null,
  };
}

export default function CalendarPage() {
  const [events, setEvents] = useState<EventDetailsData[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventDetailsData | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventDetailsData | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      if (!res.ok) {
        console.error('No se pudieron cargar los eventos');
        return;
      }
      const data: unknown = await res.json();
      const normalized = Array.isArray(data) ? data.map(normalizeEvent) : [];
      setEvents(normalized);
    } catch (error) {
      console.error('Error al obtener eventos', error);
    }
  }, []);

  const refreshEvents = useCallback(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleOpenCreate = useCallback(() => {
    setEditingEvent(null);
    setFormOpen(true);
  }, []);

  useEffect(() => {
    const btn = document.getElementById('btn-new');
    if (btn) {
      (btn as HTMLButtonElement).onclick = handleOpenCreate;
    }
    return () => {
      if (btn) {
        (btn as HTMLButtonElement).onclick = null;
      }
    };
  }, [handleOpenCreate]);

  const eventContent = useCallback(
    (
      arg: Parameters<NonNullable<typeof FullCalendar.prototype.props['eventContent']>>[0],
    ) => {
      const extended = arg.event.extendedProps as Partial<CalendarEventExtendedProps>;
      const priority: Priority = extended?.priority ?? 'RELEVANTE';
      const styles = PRIORITY_STYLES[priority];

      return (
        <div
          className="text-[11px]"
          style={{
            background: styles.bg,
            color: styles.color,
            borderRadius: 6,
            padding: '2px 6px',
          }}
        >
          {arg.event.title}
        </div>
      );
    },
    [],
  );

  const calendarEvents = useMemo(
    () =>
      events.map((evt) => ({
        id: evt.id,
        title: evt.title,
        start: evt.start ?? undefined,
        end: evt.end ?? undefined,
        extendedProps: {
          priority: evt.priority,
          rawEvent: evt,
        },
      })),
    [events],
  );

  const handleEventClick = useCallback((info: EventClickArg) => {
    const extended = info.event.extendedProps as Partial<CalendarEventExtendedProps>;
    const raw = extended?.rawEvent;
    if (raw) {
      setSelectedEvent(raw);
    }
  }, []);

  useEffect(() => {
    if (!selectedEvent) return;
    const updated = events.find((evt) => evt.id === selectedEvent.id);
    if (!updated) {
      setSelectedEvent(null);
    } else if (updated !== selectedEvent) {
      setSelectedEvent(updated);
    }
  }, [events, selectedEvent]);

  const handleDetailsClose = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  const handleEdit = useCallback((eventData: EventDetailsData) => {
    setSelectedEvent(null);
    setEditingEvent(eventData);
    setFormOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setFormOpen(false);
    setEditingEvent(null);
  }, []);

  const handleDelete = useCallback(
    async (eventToDelete: EventDetailsData) => {
      if (!window.confirm(`Eliminar "${eventToDelete.title}"?`)) return;

      try {
        const res = await fetch(`/api/events/${eventToDelete.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(`No se pudo eliminar: ${err.error || res.statusText}`);
          return;
        }
        if (editingEvent && editingEvent.id === eventToDelete.id) {
          setEditingEvent(null);
          setFormOpen(false);
        }
        setSelectedEvent(null);
        await loadEvents();
      } catch (error) {
        console.error('Error al eliminar evento', error);
        alert('Error al eliminar evento');
      }
    },
    [editingEvent, loadEvents],
  );

  return (
    <div>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
        events={calendarEvents}
        eventContent={eventContent}
        eventClick={handleEventClick}
      />

      <NewItemModal
        open={formOpen}
        onClose={handleModalClose}
        onCreated={refreshEvents}
        onUpdated={refreshEvents}
        editingEvent={editingEvent}
      />

      <EventDetailsModal
        event={selectedEvent}
        onClose={handleDetailsClose}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
