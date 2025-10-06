'use client';
import { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import NewItemModal from '@/components/NewItemModal';

type Ev = { id: string; title: string; start?: string; end?: string; priority: 'CRITICA'|'URGENTE'|'RELEVANTE'|'OPCIONAL' };

export default function CalendarPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/events').then(r => r.json()).then(setEvents);
    const btn = document.getElementById('btn-new');
    if (btn) btn.onclick = () => setOpen(true);
    return () => { if (btn) (btn as HTMLButtonElement).onclick = null; };
  }, []);

  const reload = () => fetch('/api/events').then(r => r.json()).then(setEvents);

  return (
    <div>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
        events={events}
        eventContent={(arg) => {
          const p = (arg.event.extendedProps as any).priority as Ev['priority'];
          const color =
            p === 'CRITICA' ? 'var(--critica)' :
            p === 'URGENTE' ? 'var(--urgente)' :
            p === 'RELEVANTE' ? 'var(--relevante)' : 'var(--opcional)';
          const textColor = p === 'URGENTE' || p === 'OPCIONAL' ? '#111827' : '#fff';
          return (
            <div className="text-[11px]" style={{ background: color, color: textColor, borderRadius: 6, padding: '2px 6px' }}>
              {arg.event.title}
            </div>
          );
        }}
      />

      <NewItemModal open={open} onClose={() => setOpen(false)} onCreated={reload} />
    </div>
  );
}
