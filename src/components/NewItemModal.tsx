'use client';

import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction, ReactNode } from 'react';

type Priority = 'CRITICA' | 'URGENTE' | 'RELEVANTE' | 'OPCIONAL';
type TabKey = 'evento' | 'tarea' | 'disponibilidad';
type Repeat = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
type AvailLabel = 'Pronto' | 'Esta semana' | 'Este mes' | 'Rango personalizado';

const CATEGORIES = ['Escuela', 'Trabajo', 'Personal', 'Social', 'Otro'];
const PRIORITIES: Priority[] = ['CRITICA', 'URGENTE', 'RELEVANTE', 'OPCIONAL'];
const AVAIL_WINDOWS: AvailLabel[] = ['Pronto', 'Esta semana', 'Este mes', 'Rango personalizado'];

const PRIORITY_STYLES = {
  CRITICA: { bg: 'var(--critica)', color: '#fff' },
  URGENTE: { bg: 'var(--urgente)', color: '#111827' },
  RELEVANTE: { bg: 'var(--relevante)', color: '#fff' },
  OPCIONAL: { bg: 'var(--opcional)', color: '#111827' },
};

const WINDOW_MAP: Record<AvailLabel, 'PRONTO' | 'SEMANA' | 'MES' | 'RANGO'> = {
  'Pronto': 'PRONTO',
  'Esta semana': 'SEMANA',
  'Este mes': 'MES',
  'Rango personalizado': 'RANGO',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 mb-4">
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      {children}
    </div>
  );
}

/* ===================== Componentes compartidos ===================== */
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
              {p[0] + p.slice(1).toLowerCase()}
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
};

function DisponibilidadControl(props: DisponibilidadControlProps) {
  const { availWindow, setAvailWindow, rangeStart, setRangeStart, rangeEnd, setRangeEnd } = props;

  return (
    <Section title="Disponibilidad">
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
      <p className="text-xs text-gray-500 mt-1">
        El planificador buscará el mejor slot dentro de la ventana seleccionada.
      </p>
    </Section>
  );
}

/* ===================== Secciones principales ===================== */
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

function EventoSection(props: CommonProps) {
  const { inPerson, setInPerson, priority, setPriority, date, setDate, start, setStart, end, setEnd, repeat, setRepeat, availWindow, setAvailWindow, rangeStart, setRangeStart, rangeEnd, setRangeEnd } = props;

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

      {(priority === 'URGENTE' || priority === 'RELEVANTE') && (
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
          Este elemento se enviará a la lista de espera (sin fecha ni hora).
        </div>
      )}
    </>
  );
}

function TareaSection(props: CommonProps) {
  const { inPerson, setInPerson, priority, setPriority, date, setDate, start, setStart, end, setEnd, repeat, setRepeat, availWindow, setAvailWindow, rangeStart, setRangeStart, rangeEnd, setRangeEnd } = props;

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

      {(priority === 'URGENTE' || priority === 'RELEVANTE') && (
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
          Esta tarea se enviará en la lista de espera (sin fecha ni hora).
        </div>
      )}

      <div className="text-xs text-gray-500 mt-2 p-2 bg-blue-50 rounded border border-blue-200">
        💡 Las tareas aparecerán en el calendario y en la vista de Tareas.
      </div>
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
      
      <Section title="Ventana de disponibilidad">
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
              <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="flex-1 h-10 rounded border border-ui px-3" />
              <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="flex-1 h-10 rounded border border-ui px-3" />
            </div>
          )}
        </div>
      </Section>

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

/* ===================== Hook personalizado para el estado ===================== */
function useFormState() {
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

  const resetAll = () => {
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
  };

  return {
    tab, setTab,
    title, setTitle,
    description, setDescription,
    category, setCategory,
    inPerson, setInPerson,
    priority, setPriority,
    date, setDate,
    start, setStart,
    end, setEnd,
    repeat, setRepeat,
    availWindow, setAvailWindow,
    rangeStart, setRangeStart,
    rangeEnd, setRangeEnd,
    resetAll,
  };
}

/* ===================== Utilidades de validación ===================== */
function validateCriticalDateTime(date: string, start: string, end: string): boolean {
  if (!date || !start || !end) {
    alert('Para prioridad crítica, se requiere fecha y horas de inicio/fin.');
    return false;
  }
  return true;
}

function validateCustomRange(availWindow: AvailLabel, rangeStart: string, rangeEnd: string): boolean {
  if (availWindow === 'Rango personalizado' && (!rangeStart || !rangeEnd)) {
    alert('Selecciona un rango válido de fechas.');
    return false;
  }
  return true;
}

function buildPayloadBase(state: ReturnType<typeof useFormState>, kind: 'EVENTO' | 'TAREA' | 'SOLICITUD'): Record<string, any> {
  return {
    kind,
    title: state.title,
    description: state.description || null,
    category: state.category || null,
    isInPerson: state.inPerson,
    canOverlap: !state.inPerson,
    priority: state.priority,
    repeat: state.repeat,
  };
}

function addDateTimeToPayload(payload: Record<string, any>, date: string, start: string, end: string) {
  payload.start = new Date(`${date}T${start}:00`).toISOString();
  payload.end = new Date(`${date}T${end}:00`).toISOString();
}

function addWindowToPayload(payload: Record<string, any>, availWindow: AvailLabel, rangeStart: string, rangeEnd: string) {
  payload.window = WINDOW_MAP[availWindow];
  if (availWindow === 'Rango personalizado') {
    payload.windowStart = new Date(`${rangeStart}T00:00:00`).toISOString();
    payload.windowEnd = new Date(`${rangeEnd}T23:59:59`).toISOString();
  }
}

/* ===================== Modal principal ===================== */
export default function NewItemModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const state = useFormState();

  const handleCreate = async (endpoint: string, payload: any, errorMsg: string) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      onCreated?.();
      state.resetAll();
      onClose();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`${errorMsg}: ${err.error || res.statusText}`);
    }
  };

  const createEvento = async () => {
    if (!state.title.trim()) {
      alert('El título es obligatorio.');
      return;
    }

    const payload = buildPayloadBase(state, 'EVENTO');

    if (state.priority === 'CRITICA') {
      if (!validateCriticalDateTime(state.date, state.start, state.end)) return;
      addDateTimeToPayload(payload, state.date, state.start, state.end);
    } else if (state.priority === 'URGENTE' || state.priority === 'RELEVANTE') {
      if (!validateCustomRange(state.availWindow, state.rangeStart, state.rangeEnd)) return;
      if (state.date && state.start && state.end) {
        addDateTimeToPayload(payload, state.date, state.start, state.end);
      } else {
        addWindowToPayload(payload, state.availWindow, state.rangeStart, state.rangeEnd);
      }
    } else {
      payload.status = 'WAITLIST';
    }

    await handleCreate('/api/events', payload, 'Error al crear el evento');
  };

  const createTarea = async () => {
    if (!state.title.trim()) {
      alert('El título es obligatorio.');
      return;
    }

    const payload = buildPayloadBase(state, 'TAREA');

    if (state.priority === 'CRITICA') {
      if (!validateCriticalDateTime(state.date, state.start, state.end)) return;
      addDateTimeToPayload(payload, state.date, state.start, state.end);
    } else if (state.priority === 'URGENTE' || state.priority === 'RELEVANTE') {
      if (!validateCustomRange(state.availWindow, state.rangeStart, state.rangeEnd)) return;
      addWindowToPayload(payload, state.availWindow, state.rangeStart, state.rangeEnd);
    } else {
      payload.status = 'WAITLIST';
    }

    await handleCreate('/api/events', payload, 'Error al crear tarea');
  };

  const createSolicitud = async () => {
    if (!state.title.trim()) {
      alert('El título es obligatorio.');
      return;
    }

    const payload: any = {
      kind: 'SOLICITUD',
      title: state.title,
      description: state.description,
      priority: 'RELEVANTE',
      category: state.category || null,
      isInPerson: true,
      status: 'PENDING',
      shareLink: 'https://tuapp/solicitud/xxxx',
    };

    addWindowToPayload(payload, state.availWindow, state.rangeStart, state.rangeEnd);

    await handleCreate('/api/events', payload, 'Error al crear la solicitud de disponibilidad');
  };

  if (!open) return null;

  const tabs = [
    { key: 'evento', label: 'Crear evento', action: createEvento, btnText: 'Guardar evento' },
    { key: 'tarea', label: 'Crear tarea', action: createTarea, btnText: 'Guardar tarea' },
    { key: 'disponibilidad', label: 'Solicitud de disponibilidad', action: createSolicitud, btnText: 'Crear solicitud' },
  ];

  const currentTab = tabs.find(t => t.key === state.tab)!;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="w-[720px] max-w-[95vw] max-h-[85vh] overflow-y-auto bg-surface rounded-2xl p-6 pb-0 border border-ui shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Crear</h2>
          <button
            className="text-sm px-3 py-2 rounded border border-ui hover:bg-gray-50 transition-colors"
            onClick={() => { state.resetAll(); onClose(); }}
          >
            Cerrar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-ui mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => state.setTab(t.key as TabKey)}
              className={`px-3 py-2 text-sm rounded-t border border-ui border-b-0 transition-all ${
                state.tab === t.key ? 'bg-white font-medium' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Formulario */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Section title="Título (obligatorio)">
            <input
              value={state.title}
              onChange={(e) => state.setTitle(e.target.value)}
              className="w-full h-10 rounded border border-ui px-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              placeholder="Escribe un título"
            />
          </Section>

          <Section title="Categoría (opcional)">
            <select
              value={state.category}
              onChange={(e) => state.setCategory(e.target.value)}
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
                value={state.description}
                onChange={(e) => state.setDescription(e.target.value)}
                className="w-full h-24 rounded border border-ui px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="Descripción"
              />
            </Section>
          </div>

          <div className="col-span-2">
            {state.tab === 'evento' && (
              <EventoSection
                inPerson={state.inPerson} setInPerson={state.setInPerson}
                priority={state.priority} setPriority={state.setPriority}
                date={state.date} setDate={state.setDate}
                start={state.start} setStart={state.setStart}
                end={state.end} setEnd={state.setEnd}
                repeat={state.repeat} setRepeat={state.setRepeat}
                availWindow={state.availWindow} setAvailWindow={state.setAvailWindow}
                rangeStart={state.rangeStart} setRangeStart={state.setRangeStart}
                rangeEnd={state.rangeEnd} setRangeEnd={state.setRangeEnd}
              />
            )}

            {state.tab === 'tarea' && (
              <TareaSection
                inPerson={state.inPerson} setInPerson={state.setInPerson}
                priority={state.priority} setPriority={state.setPriority}
                date={state.date} setDate={state.setDate}
                start={state.start} setStart={state.setStart}
                end={state.end} setEnd={state.setEnd}
                repeat={state.repeat} setRepeat={state.setRepeat}
                availWindow={state.availWindow} setAvailWindow={state.setAvailWindow}
                rangeStart={state.rangeStart} setRangeStart={state.setRangeStart}
                rangeEnd={state.rangeEnd} setRangeEnd={state.setRangeEnd}
              />
            )}

            {state.tab === 'disponibilidad' && (
              <DisponibilidadSection
                date={state.date} setDate={state.setDate}
                start={state.start} setStart={state.setStart}
                end={state.end} setEnd={state.setEnd}
                availWindow={state.availWindow} setAvailWindow={state.setAvailWindow}
                rangeStart={state.rangeStart} setRangeStart={state.setRangeStart}
                rangeEnd={state.rangeEnd} setRangeEnd={state.setRangeEnd}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 sticky bottom-0 bg-surface py-4 border-t border-ui">
          <button
            className="h-10 px-4 rounded border border-ui hover:bg-gray-50 transition-colors"
            onClick={() => { state.resetAll(); onClose(); }}
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