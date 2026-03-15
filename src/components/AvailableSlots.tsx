'use client';

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
 * Muestra hasta 8 slots libres de la semana actual (horas completas).
 * Es un apoyo visual para que el usuario identifique cuándo está libre
 * y como fuente de sugerencias al crear eventos colaborativos.
 */
export default function AvailableSlots({ slots, onSlotClick, maxVisible = 8 }: Props) {
  const visible = slots.slice(0, maxVisible);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
          <Clock className="h-5 w-5" />
        </div>
        <p className="text-xs text-[var(--muted)]">Sin horas libres esta semana.</p>
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
    </div>
  );
}
