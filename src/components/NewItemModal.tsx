'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction, ReactNode } from 'react';
import { PRIORITIES, PRIORITY_STYLES, PRIORITY_LABELS, type Priority } from '@/lib/priorities';

type TabKey = 'evento' | 'tarea' | 'disponibilidad';
type Repeat = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
type AvailLabel = 'Pronto' | 'Esta semana' | 'Este mes' | 'Rango personalizado';
export type WindowCode = 'PRONTO' | 'SEMANA' | 'MES' | 'RANGO' | 'NONE';

type ItemPayload = {
  kind: 'EVENTO' | 'TAREA' | 'SOLICITUD';
  title: string;
  description: string | null;
  category: string | null;
  isInPerson: boolean;
  canOverlap: boolean;
  priority: Priority;
  repeat: Repeat;
  start?: string;
  end?: string;
  window?: WindowCode;
  windowStart?: string;
  windowEnd?: string;
  status?: string;
  shareLink?: string;
};

export type EditableEvent = {
  id: string;
  kind: ItemPayload['kind'];
  title: string;
  description: string | null;
  category: string | null;
  isInPerson: boolean;
  canOverlap: boolean;
  priority: Priority;
  repeat: Repeat;
  start: string | null;
  end: string | null;
  window: WindowCode | null;
  windowStart: string | null;
  windowEnd: string | null;
  status: string;
  shareLink: string | null;
};

const CATEGORIES = ['Escuela', 'Trabajo', 'Personal', 'Social', 'Otro'];
const AVAIL_WINDOWS: AvailLabel[] = ['Pronto', 'Esta semana', 'Este mes', 'Rango personalizado'];

const WINDOW_MAP: Record<AvailLabel, WindowCode> = {
  'Pronto': 'PRONTO',
  'Esta semana': 'SEMANA',
  'Este mes': 'MES',
  'Rango personalizado': 'RANGO',
};

const WINDOW_REVERSE_MAP: Record<WindowCode, AvailLabel> = {
  PRONTO: 'Pronto',
  SEMANA: 'Esta semana',
  MES: 'Este mes',
  RANGO: 'Rango personalizado',
  NONE: 'Pronto',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 mb-4">
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      {children}
    </div>
  );
}

function toDateInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const tzOffset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - tzOffset);
  return local.toISOString().slice(0, 10);
}

function toTimeInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const tzOffset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - tzOffset);
  return local.toISOString().slice(11, 16);
}

type NewItemModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  onUpdated?: () => void;
  editingEvent?: EditableEvent | null;
};

type PresencialidadProps = {
  inPerson: boolean;
  setInPerson: Dispatch<SetStateAction<boolean>>;
};

function PresencialidadControl({ inPerson, setInPerson }: PresencialidadProps) {
  return (
    <Section title="Presencialidad">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="radio" checked={inPerson} onChange={() => setInPerson(true)} />
          Presencial
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="radio" checked={!inPerson} onChange={() => setInPerson(false)} />
          No presencial
        </label>
        <span className="text-xs text-gray-500">No presencial puede superponerse con otras tareas.</span>
      </div>
    </Section>
  );
}

type PriorityControlProps = {
  priority: Priority;
  setPriority: Dispatch<SetStateAction<Priority>>;
};

function PriorityControl({ priority, setPriority }: PriorityControlProps) {
  return (
    <Section title="Prioridad">
      <div className="flex gap-2">
        {PRIORITIES.map((p) => {
          const styles = PRIORITY_STYLES[p];
          return (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`px-3 py-2 text-sm rounded border transition-all ${
                priority === p ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20' : 'border-ui'
              }`}
              style={{ background: styles.bg, color: styles.color }}
            >
              {PRIORITY_LABELS[p]}
            </button>
          );
        })}
      </div>
    </Section>
  );
}

type DateTimeControlProps = {
  date: string;
  setDate: Dispatch<SetStateAction<string>>;
  start: string;
  setStart: Dispatch<SetStateAction<string>>;
  end: string;
  setEnd: Dispatch<SetStateAction<string>>;
  required?: boolean;
};

function DateTimeControl({ date, setDate, start, setStart, end, setEnd, required = false }: DateTimeControlProps) {
  return (
    <Section title={`Fecha y hora ${required ? '(obligatorio)' : '(opcional)'}`}>
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-10 rounded border border-ui px-3"
        />
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="h-10 rounded border border-ui px-3"
        />
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="h-10 rounded border border-ui px-3"
        />
      </div>
    </Section>
  );
}

type RepeatControlProps = {
  repeat: Repeat;
  setRepeat: Dispatch<SetStateAction<Repeat>>;
};

function RepeatControl({ repeat, setRepeat }: RepeatControlProps) {
  return (
    <Section title="Repetición">
      <select
        value={repeat}
        onChange={(e) => setRepeat(e.target.value as Repeat)}
        className="h-10 rounded border border-ui px-3 bg-white"
      >
        <option value="NONE">No repetir</option>
        <option value="DAILY">Diario</option>
        <option value="WEEKLY">Semanal</option>
        <option value="MONTHLY">Mensual</option>
        <option value="YEARLY">Anual</option>
      </select>
    </Section>
  );
}

type DisponibilidadControlProps = {
  availWindow: AvailLabel;
  setAvailWindow: Dispatch<SetStateAction<AvailLabel>>;
  rangeStart: string;
  setRangeStart: Dispatch<SetStateAction<string>>;
  rangeEnd: string;
  setRangeEnd: Dispatch<SetStateAction<string>>;
  title?: string;
  helperText?: string;
};

function DisponibilidadControl(props: DisponibilidadControlProps) {
  const {
    availWindow,
    setAvailWindow,
    rangeStart,
    setRangeStart,
    rangeEnd,
    setRangeEnd,
    title = 'Disponibilidad',
    helperText = 'El planificador buscará el mejor slot dentro de la ventana seleccionada.',
  } = props;

  return (
    <Section title={title}>
      <div className="space-y-2">
        <select
          value={availWindow}
          onChange={(e) => setAvailWindow(e.target.value as AvailLabel)}
          className="w-full h-10 rounded border border-ui px-3 bg-white"
        >
          {AVAIL_WINDOWS.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        {availWindow === 'Rango personalizado' && (
          <div className="flex gap-2">
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="flex-1 h-10 rounded border border-ui px-3"
              placeholder="Inicio"
            />
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="flex-1 h-10 rounded border border-ui px-3"
              placeholder="Fin"
            />
          </div>
        )}
      </div>
      {helperText && (
        <p className="text-xs text-gray-500 mt-1">{helperText}</p>
      )}
    </Section>
  );
}

type CommonProps = {
  inPerson: boolean;
  setInPerson: Dispatch<SetStateAction<boolean>>;
  priority: Priority;
  setPriority: Dispatch<SetStateAction<Priority>>;
  date: string;
  setDate: Dispatch<SetStateAction<string>>;
  start: string;
  setStart: Dispatch<SetStateAction<string>>;
  end: string;
  setEnd: Dispatch<SetStateAction<string>>;
  repeat: Repeat;
  setRepeat: Dispatch<SetStateAction<Repeat>>;
  availWindow: AvailLabel;
  setAvailWindow: Dispatch<SetStateAction<AvailLabel>>;
  rangeStart: string;
  setRangeStart: Dispatch<SetStateAction<string>>;
  rangeEnd: string;
  setRangeEnd: Dispatch<SetStateAction<string>>;
};

type SchedulingSectionProps = CommonProps & {
  waitlistMessage: string;
  extraInfo?: ReactNode;
};

function SchedulingSection(props: SchedulingSectionProps) {
  const {
    inPerson,
    setInPerson,
    priority,
    setPriority,
    date,
    setDate,
    start,
    setStart,
    end,
    setEnd,
    repeat,
    setRepeat,
    availWindow,
    setAvailWindow,
    rangeStart,
    setRangeStart,
    rangeEnd,
    setRangeEnd,
    waitlistMessage,
    extraInfo,
  } = props;

  const showAvailability = priority === 'URGENTE' || priority === 'RELEVANTE';

  return (
    <>
      <PresencialidadControl inPerson={inPerson} setInPerson={setInPerson} />
      <PriorityControl priority={priority} setPriority={setPriority} />

      {priority === 'CRITICA' && (
        <>
          <DateTimeControl date={date} setDate={setDate} start={start} setStart={setStart} end={end} setEnd={setEnd} required />
          <RepeatControl repeat={repeat} setRepeat={setRepeat} />
        </>
      )}

      {showAvailability && (
        <DisponibilidadControl
          availWindow={availWindow}
          setAvailWindow={setAvailWindow}
          rangeStart={rangeStart}
          setRangeStart={setRangeStart}
          rangeEnd={rangeEnd}
          setRangeEnd={setRangeEnd}
        />
      )}

      {priority === 'OPCIONAL' && (
        <div className="text-sm text-gray-600 p-3 bg-gray-50 rounded border border-ui">
          {waitlistMessage}
        </div>
      )}

      {extraInfo}
    </>
  );
}

type DisponibilidadSectionProps = {
  date: string;
  setDate: Dispatch<SetStateAction<string>>;
  start: string;
  setStart: Dispatch<SetStateAction<string>>;
  end: string;
  setEnd: Dispatch<SetStateAction<string>>;
  availWindow: AvailLabel;
  setAvailWindow: Dispatch<SetStateAction<AvailLabel>>;
  rangeStart: string;
  setRangeStart: Dispatch<SetStateAction<string>>;
  rangeEnd: string;
  setRangeEnd: Dispatch<SetStateAction<string>>;
};

function DisponibilidadSection(props: DisponibilidadSectionProps) {
  const { date, setDate, start, setStart, end, setEnd, availWindow, setAvailWindow, rangeStart, setRangeStart, rangeEnd, setRangeEnd } = props;

  return (
    <>
      <DateTimeControl date={date} setDate={setDate} start={start} setStart={setStart} end={end} setEnd={setEnd} />

      <DisponibilidadControl
        availWindow={availWindow}
        setAvailWindow={setAvailWindow}
        rangeStart={rangeStart}
        setRangeStart={setRangeStart}
        rangeEnd={rangeEnd}
        setRangeEnd={setRangeEnd}
        title="Ventana de disponibilidad"
        helperText={undefined}
      />

      <Section title="Colaboración">
        <input
          value="https://tuapp/solicitud/xxxx"
          readOnly
          className="w-full h-10 rounded border border-ui px-3 bg-gray-50"
        />
        <p className="text-xs text-gray-500">Comparte este enlace para que otros usuarios indiquen su disponibilidad.</p>
      </Section>
    </>
  );
}

export default function NewItemModal({
  open,
  onClose,
  onCreated,
  onUpdated,
  editingEvent,
}: NewItemModalProps) {
  const [tab, setTab] = useState<TabKey>('evento');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [inPerson, setInPerson] = useState(true);
  const [priority, setPriority] = useState<Priority>('RELEVANTE');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [repeat, setRepeat] = useState<Repeat>('NONE');
  const [availWindow, setAvailWindow] = useState<AvailLabel>('Pronto');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const isEditing = Boolean(editingEvent);

  const resetAll = useCallback(() => {
    setTitle('');
    setDescription('');
    setCategory('');
    setInPerson(true);
    setPriority('RELEVANTE');
    setDate('');
    setStart('');
    setEnd('');
    setRepeat('NONE');
    setAvailWindow('Pronto');
    setRangeStart('');
    setRangeEnd('');
    setTab('evento');
  }, []);

  useEffect(() => {
    if (!open) return;

    if (!editingEvent) {
      resetAll();
      return;
    }

    const tabFromKind: TabKey = editingEvent.kind === 'EVENTO'
      ? 'evento'
      : editingEvent.kind === 'TAREA'
        ? 'tarea'
        : 'disponibilidad';
    setTab(tabFromKind);
    setTitle(editingEvent.title);
    setDescription(editingEvent.description ?? '');
    setCategory(editingEvent.category ?? '');
    setInPerson(editingEvent.isInPerson);
    setPriority(editingEvent.priority);
    setRepeat(editingEvent.repeat);

    if (editingEvent.start && editingEvent.end) {
      setDate(toDateInput(editingEvent.start));
      setStart(toTimeInput(editingEvent.start));
      setEnd(toTimeInput(editingEvent.end));
    } else {
      setDate('');
      setStart('');
      setEnd('');
    }

    const windowCode: WindowCode = editingEvent.window ?? 'NONE';
    setAvailWindow(WINDOW_REVERSE_MAP[windowCode] ?? 'Pronto');

    if (windowCode === 'RANGO' && editingEvent.windowStart && editingEvent.windowEnd) {
      setRangeStart(toDateInput(editingEvent.windowStart));
      setRangeEnd(toDateInput(editingEvent.windowEnd));
    } else {
      setRangeStart('');
      setRangeEnd('');
    }
  }, [open, editingEvent, resetAll]);

  const handleSubmit = async (
    endpoint: string,
    method: 'POST' | 'PATCH',
    payload: ItemPayload,
    errorMsg: string,
  ) => {
    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      if (method === 'POST') {
        onCreated?.();
      } else {
        onUpdated?.();
      }
      resetAll();
      onClose();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`${errorMsg}: ${err.error || res.statusText}`);
    }
  };

  const submitEvento = async () => {
    if (!title.trim()) {
      alert('El título es obligatorio.');
      return;
    }

    const payload: ItemPayload = {
      kind: 'EVENTO',
      title,
      description: description || null,
      category: category || null,
      isInPerson: inPerson,
      canOverlap: !inPerson,
      priority,
      repeat,
    };

    if (priority === 'CRITICA') {
      if (!date || !start || !end) {
        alert('Para prioridad crítica, se requiere fecha y horas de inicio/fin.');
        return;
      }
      payload.start = new Date(`${date}T${start}:00`).toISOString();
      payload.end = new Date(`${date}T${end}:00`).toISOString();
    } else if (priority === 'URGENTE' || priority === 'RELEVANTE') {
      if (date && start && end) {
        payload.start = new Date(`${date}T${start}:00`).toISOString();
        payload.end = new Date(`${date}T${end}:00`).toISOString();
      } else {
        if (availWindow === 'Rango personalizado' && (!rangeStart || !rangeEnd)) {
          alert('Selecciona un rango válido de fechas.');
          return;
        }
        payload.window = WINDOW_MAP[availWindow];
        if (availWindow === 'Rango personalizado') {
          payload.windowStart = new Date(`${rangeStart}T00:00:00`).toISOString();
          payload.windowEnd = new Date(`${rangeEnd}T23:59:59`).toISOString();
        }
      }
    } else {
      payload.status = 'WAITLIST';
    }

    if (isEditing && editingEvent && editingEvent.kind === 'EVENTO') {
      await handleSubmit(`/api/events/${editingEvent.id}`, 'PATCH', payload, 'Error al actualizar el evento');
    } else {
      await handleSubmit('/api/events', 'POST', payload, 'Error al crear el evento');
    }
  };

  const submitTarea = async () => {
    if (!title.trim()) {
      alert('El título es obligatorio.');
      return;
    }

    const payload: ItemPayload = {
      kind: 'TAREA',
      title,
      description: description || null,
      category: category || null,
      isInPerson: inPerson,
      canOverlap: !inPerson,
      priority,
      repeat,
    };

    if (priority === 'CRITICA') {
      if (!date || !start || !end) {
        alert('Para prioridad crítica, se requiere fecha y horas de inicio/fin.');
        return;
      }
      payload.start = new Date(`${date}T${start}:00`).toISOString();
      payload.end = new Date(`${date}T${end}:00`).toISOString();
    } else if (priority === 'URGENTE' || priority === 'RELEVANTE') {
      if (availWindow === 'Rango personalizado' && (!rangeStart || !rangeEnd)) {
        alert('Selecciona un rango válido de fechas.');
        return;
      }
      payload.window = WINDOW_MAP[availWindow];
      if (availWindow === 'Rango personalizado') {
        payload.windowStart = new Date(`${rangeStart}T00:00:00`).toISOString();
        payload.windowEnd = new Date(`${rangeEnd}T23:59:59`).toISOString();
      }
    } else {
      payload.status = 'WAITLIST';
    }

    if (isEditing && editingEvent && editingEvent.kind === 'TAREA') {
      await handleSubmit(`/api/events/${editingEvent.id}`, 'PATCH', payload, 'Error al actualizar la tarea');
    } else {
      await handleSubmit('/api/events', 'POST', payload, 'Error al crear tarea');
    }
  };

  const submitSolicitud = async () => {
    if (!title.trim()) {
      alert('El título es obligatorio.');
      return;
    }

    const payload: ItemPayload = {
      kind: 'SOLICITUD',
      title,
      description: description || null,
      category: category || null,
      isInPerson: true,
      canOverlap: false,
      priority: 'RELEVANTE',
      repeat: 'NONE',
      status: isEditing && editingEvent ? editingEvent.status : 'PENDING',
      shareLink: isEditing && editingEvent ? editingEvent.shareLink || undefined : 'https://tuapp/solicitud/xxxx',
    };

    if (availWindow === 'Rango personalizado' && (!rangeStart || !rangeEnd)) {
      alert('Selecciona un rango válido de fechas.');
      return;
    }

    payload.window = WINDOW_MAP[availWindow];
    if (availWindow === 'Rango personalizado') {
      payload.windowStart = new Date(`${rangeStart}T00:00:00`).toISOString();
      payload.windowEnd = new Date(`${rangeEnd}T23:59:59`).toISOString();
    }

    if (isEditing && editingEvent && editingEvent.kind === 'SOLICITUD') {
      await handleSubmit(`/api/events/${editingEvent.id}`, 'PATCH', payload, 'Error al actualizar la solicitud');
    } else {
      await handleSubmit('/api/events', 'POST', payload, 'Error al crear la solicitud');
    }
  };

  if (!open) return null;

  const schedulingProps: CommonProps = {
    inPerson,
    setInPerson,
    priority,
    setPriority,
    date,
    setDate,
    start,
    setStart,
    end,
    setEnd,
    repeat,
    setRepeat,
    availWindow,
    setAvailWindow,
    rangeStart,
    setRangeStart,
    rangeEnd,
    setRangeEnd,
  };

  const tabConfigs = [
    {
      key: 'evento' as const,
      createLabel: 'Crear evento',
      editLabel: 'Editar evento',
      createBtn: 'Guardar evento',
      editBtn: 'Actualizar evento',
      action: submitEvento,
    },
    {
      key: 'tarea' as const,
      createLabel: 'Crear tarea',
      editLabel: 'Editar tarea',
      createBtn: 'Guardar tarea',
      editBtn: 'Actualizar tarea',
      action: submitTarea,
    },
    {
      key: 'disponibilidad' as const,
      createLabel: 'Solicitud de disponibilidad',
      editLabel: 'Editar solicitud',
      createBtn: 'Crear solicitud',
      editBtn: 'Actualizar solicitud',
      action: submitSolicitud,
    },
  ];

  const enforcedTabKey: TabKey | null = isEditing && editingEvent
    ? (editingEvent.kind === 'EVENTO'
        ? 'evento'
        : editingEvent.kind === 'TAREA'
          ? 'tarea'
          : 'disponibilidad')
    : null;

  const tabs = tabConfigs
    .filter((tabConfig) => !enforcedTabKey || tabConfig.key === enforcedTabKey)
    .map((tabConfig) => ({
      key: tabConfig.key,
      label: isEditing ? tabConfig.editLabel : tabConfig.createLabel,
      action: tabConfig.action,
      btnText: isEditing ? tabConfig.editBtn : tabConfig.createBtn,
    }));

  const currentTab = tabs.find((t) => t.key === tab) ?? tabs[0];

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="w-[720px] max-w-[95vw] max-h-[85vh] bg-surface rounded-2xl border border-ui shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ui bg-surface sticky top-0 z-20">
          <h2 className="text-lg font-semibold text-gray-900">{isEditing ? 'Editar' : 'Crear'}</h2>
          <button
            className="text-sm px-3 py-2 rounded border border-ui hover:bg-gray-50 transition-colors"
            onClick={() => { resetAll(); onClose(); }}
          >
            Cerrar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 min-h-0">
          <div className="flex gap-2 border-b border-ui mb-6">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-2 text-sm rounded-t border border-ui border-b-0 transition-all ${
                  tab === t.key ? 'bg-white font-medium' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <Section title="Título (obligatorio)">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-10 rounded border border-ui px-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="Escribe un título"
              />
            </Section>

            <Section title="Categoría (opcional)">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-10 rounded border border-ui px-3 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                <option value="">Sin categoría</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Section>

            <div className="col-span-2">
              <Section title="Descripción (opcional)">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-24 rounded border border-ui px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="Descripción"
                />
              </Section>
            </div>

            <div className="col-span-2">
              {tab === 'evento' && (
                <SchedulingSection
                  {...schedulingProps}
                  waitlistMessage="Este elemento se enviará a la lista de espera (sin fecha ni hora)."
                />
              )}

              {tab === 'tarea' && (
                <SchedulingSection
                  {...schedulingProps}
                  waitlistMessage="Esta tarea se enviará en la lista de espera (sin fecha ni hora)."
                  extraInfo={(
                    <div className="text-xs text-gray-500 mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                      💡 Las tareas aparecerán en el calendario y en la vista de Tareas.
                    </div>
                  )}
                />
              )}

              {tab === 'disponibilidad' && (
                <DisponibilidadSection
                  date={date} setDate={setDate}
                  start={start} setStart={setStart}
                  end={end} setEnd={setEnd}
                  availWindow={availWindow} setAvailWindow={setAvailWindow}
                  rangeStart={rangeStart} setRangeStart={setRangeStart}
                  rangeEnd={rangeEnd} setRangeEnd={setRangeEnd}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-ui bg-surface">
          <button
            className="h-10 px-4 rounded border border-ui hover:bg-gray-50 transition-colors"
            onClick={() => { resetAll(); onClose(); }}
          >
            Cancelar
          </button>
          <button
            className="h-10 px-4 rounded text-white hover:opacity-90 transition-opacity"
            style={{ background: 'var(--accent)' }}
            onClick={currentTab.action}
          >
            {currentTab.btnText}
          </button>
        </div>
      </div>
    </div>
  );
}