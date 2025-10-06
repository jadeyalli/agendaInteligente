'use client';

import { PRIORITY_LABELS, PRIORITY_STYLES } from '@/lib/priorities';
import type { EditableEvent, WindowCode } from './NewItemModal';

export type EventDetailsData = EditableEvent & {
  kind: 'EVENTO' | 'TAREA' | 'SOLICITUD';
  durationMinutes: number | null;
};

type EventDetailsModalProps = {
  event: EventDetailsData | null;
  onClose: () => void;
  onEdit: (event: EventDetailsData) => void;
  onDelete: (event: EventDetailsData) => void;
};

const KIND_LABELS: Record<EventDetailsData['kind'], string> = {
  EVENTO: 'Evento',
  TAREA: 'Tarea',
  SOLICITUD: 'Solicitud de disponibilidad',
};

const REPEAT_LABELS = {
  NONE: 'No repetir',
  DAILY: 'Diario',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensual',
  YEARLY: 'Anual',
} as const;

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return value;
  }
}

function getWindowLabel(window: WindowCode | null | undefined) {
  switch (window) {
    case 'PRONTO':
      return 'Pronto';
    case 'SEMANA':
      return 'Esta semana';
    case 'MES':
      return 'Este mes';
    case 'RANGO':
      return 'Rango personalizado';
    case 'NONE':
    default:
      return 'Sin ventana';
  }
}

export default function EventDetailsModal({ event, onClose, onEdit, onDelete }: EventDetailsModalProps) {
  if (!event) return null;

  const priorityStyle = PRIORITY_STYLES[event.priority];
  const priorityLabel = PRIORITY_LABELS[event.priority];
  const hasSchedule = Boolean(event.start && event.end);
  const windowLabel = getWindowLabel(event.window);
  const windowRange = event.window === 'RANGO' && event.windowStart && event.windowEnd
    ? `${formatDate(event.windowStart)} - ${formatDate(event.windowEnd)}`
    : null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="w-[520px] max-w-[95vw] max-h-[80vh] bg-surface rounded-2xl border border-ui shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b border-ui bg-surface sticky top-0 z-20">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">{KIND_LABELS[event.kind]}</p>
            <h2 className="text-lg font-semibold text-gray-900">{event.title}</h2>
          </div>
          <button
            className="text-sm px-3 py-2 rounded border border-ui hover:bg-gray-50 transition-colors"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: priorityStyle.bg, color: priorityStyle.color }}
            >
              {priorityLabel}
            </span>
            <span className="text-xs uppercase tracking-wide text-gray-600 bg-gray-100 px-2 py-1 rounded">{event.status || 'Sin estado'}</span>
          </div>

          {event.description && (
            <div>
              <p className="text-xs uppercase text-gray-500 mb-1">Descripcion</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{event.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
            <div>
              <p className="text-xs uppercase text-gray-500">Categoria</p>
              <p>{event.category || 'Sin categoria'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Presencialidad</p>
              <p>{event.isInPerson ? 'Presencial' : 'No presencial'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Permite solaparse</p>
              <p>{event.canOverlap ? 'Si' : 'No'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Repeticion</p>
              <p>{REPEAT_LABELS[event.repeat]}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Duracion</p>
              <p>{event.durationMinutes ? `${event.durationMinutes} min` : 'Sin definir'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Ventana</p>
              <p>{windowLabel}{windowRange ? ` - ${windowRange}` : ''}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Enlace</p>
              <p>{event.shareLink ? <a href={event.shareLink} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">Abrir enlace</a> : 'Sin enlace'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Estado</p>
              <p>{event.status || 'Sin estado'}</p>
            </div>
          </div>

          <div className="border border-ui rounded-xl p-4 bg-gray-50 text-sm text-gray-700 space-y-2">
            <p className="text-xs uppercase text-gray-500">Horario</p>
            {hasSchedule ? (
              <div className="space-y-1">
                <p><span className="font-medium">Inicio:</span> {formatDateTime(event.start!)} </p>
                <p><span className="font-medium">Fin:</span> {formatDateTime(event.end!)} </p>
              </div>
            ) : (
              <div>
                <p><span className="font-medium">Ventana:</span> {windowLabel}</p>
                {windowRange && (<p><span className="font-medium">Disponible:</span> {windowRange}</p>)}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-ui bg-surface">
          <button
            className="h-10 px-4 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            onClick={() => onDelete(event)}
          >
            Eliminar
          </button>
          <button
            className="h-10 px-4 rounded border border-ui hover:bg-gray-50 transition-colors"
            onClick={() => onEdit(event)}
          >
            Editar
          </button>
        </div>
      </div>
    </div>
  );
}
