'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';

/** Un slot libre de una hora completa. */
export interface AvailableSlot {
  start: Date;
  end: Date;
  dayLabel: string;
}

interface Props {
  slots: AvailableSlot[];
  onSlotClick: (start: Date, end: Date) => void;
  onSelectManually?: () => void;
  maxVisible?: number;
}

/** Formatea una hora como "09:00". */
function fmtTime(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Muestra slots libres dentro de los próximos 15 días.
 * Muestra 8 por defecto con opción de expandir.
 */
export default function AvailableSlots({ slots, onSlotClick, onSelectManually, maxVisible = 8 }: Props) {
  const [expanded, setExpanded] = useState(false);

  const now = new Date();
  const cutoff = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

  const within15Days = slots.filter((s) => s.start >= now && s.start <= cutoff);
  const visible = expanded ? within15Days : within15Days.slice(0, maxVisible);
  const hasMore = within15Days.length > maxVisible;

  if (within15Days.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
          <Clock className="h-5 w-5" />
        </div>
        <p className="text-xs text-[var(--muted)]">Sin horas libres en los próximos 15 días.</p>
        {onSelectManually && (
          <button type="button" onClick={onSelectManually}
            className="mt-1 text-xs text-indigo-600 underline hover:text-indigo-700">
            Prefiero seleccionar horario manualmente
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {visible.map((slot) => (
        <button
          key={`${slot.start.getTime()}`}
          type="button"
          onClick={() => onSlotClick(slot.start, slot.end)}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-white"
        >
          <span className="text-xs font-medium text-[var(--fg)] capitalize">{slot.dayLabel}</span>
          <span className="text-xs text-[var(--muted)]">
            {fmtTime(slot.start)} – {fmtTime(slot.end)}
          </span>
        </button>
      ))}

      {!expanded && hasMore && (
        <button type="button" onClick={() => setExpanded(true)}
          className="w-full pt-1 text-xs text-[var(--muted)] underline hover:text-[var(--fg)]">
          Ver más ({within15Days.length - maxVisible} más)
        </button>
      )}

      {onSelectManually && (
        <button type="button" onClick={onSelectManually}
          className="w-full pt-1 text-xs text-indigo-600 underline hover:text-indigo-700">
          Prefiero seleccionar horario manualmente
        </button>
      )}
    </div>
  );
}
