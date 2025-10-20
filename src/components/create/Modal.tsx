"use client";

import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Type as TypeIcon,
  FolderOpen,
  FileText,
  Flag,
  Calendar,
  Clock,
  Repeat as RepeatIcon,
  CalendarRange,
} from "lucide-react";
import {
  dateAndTimeToDateLocal,
  dateStringToEndOfDay,
  dateStringToStartOfDay,
} from "@/lib/datetime";

import {
  dateAndTimeToDateLocal,  // ✅ NUEVO: para crear Date desde inputs locales
  debugDateFull,           // ✅ NUEVO: para debug
} from '@/lib/timezone';

/** =========================================================
 * CreateEditModal
 * ========================================================= */

type Priority = "CRITICA" | "URGENTE" | "RELEVANTE" | "OPCIONAL" | "RECORDATORIO";
type RepeatRule = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type AvailabilityWindow = "NONE" | "PRONTO" | "SEMANA" | "MES" | "RANGO";

type EventForm = {
  kind: "EVENTO";
  title: string;
  description?: string;
  category?: string;
  priority: Priority;
  repeat: RepeatRule;
  window: AvailabilityWindow;
  windowStart?: string;
  windowEnd?: string;
  date?: string;
  timeStart?: string;
  timeEnd?: string;
};

type ReminderForm = {
  kind: "RECORDATORIO";
  title: string;
  description?: string;
  category?: string;
  isAllDay: boolean;
  repeat: RepeatRule;
  date?: string;       // required in UI
  timeStart?: string;  // optional if isAllDay
  timeEnd?: string;    // optional
};

type Props = {
  open: boolean;
  mode?: "create" | "edit";
  initialTab?: "evento" | "recordatorio";
  initialValues?: Partial<EventForm & ReminderForm>;
  title?: string;
  onSubmit: (payload: any) => void;
  onClose: () => void;
};

/* -------------------------- estilos base -------------------------- */
const classNames = (...xs: (string | false | undefined)[]) => xs.filter(Boolean).join(" ");
const card = "bg-white shadow-sm rounded-2xl border border-slate-200";
const inputBase =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800F placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";
const labelBase = "inline-flex items-center gap-2 text-sm font-medium text-slate-700";
const subtle = "text-slate-500 text-sm";
const button =
  "inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-slate-800 hover:bg-slate-50 active:bg-slate-100 transition text-sm";
const primary =
  "inline-flex items-center justify-center rounded-xl bg-slate-900 text-white px-4 py-2 hover:bg-slate-800 active:bg-slate-700 transition";

/* ------------------------ subcomponentes UI ----------------------- */
const ModalShell: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, children }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
      >
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <motion.div
          initial={{ y: 16, scale: 0.98, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 16, scale: 0.98, opacity: 0 }}
          transition={{ type: "spring", stiffness: 250, damping: 24 }}
          className={classNames(
            card,
            "relative z-10 w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
          )}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              onClick={onClose}
              aria-label="Cerrar"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

type ClassNameChild = React.ReactElement<{ className?: string }>;

const Field: React.FC<{
  label: string;
  hint?: string;
  labelIcon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  children: ClassNameChild;
}> = ({ label, hint, labelIcon, leftIcon, children }) => {
  const childWithPadding: ClassNameChild =
    leftIcon && React.isValidElement(children)
      ? React.cloneElement(children as ClassNameChild, {
          className: [(children.props as { className?: string }).className, "pl-10"]
            .filter(Boolean)
            .join(" "),
        })
      : (children as ClassNameChild);

  return (
    <div className="space-y-1">
      <label className={labelBase}>
        {labelIcon}
        <span>{label}</span>
      </label>

      {leftIcon ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {leftIcon}
          </span>
          {childWithPadding}
        </div>
      ) : (
        childWithPadding
      )}

      {hint && <p className={subtle}>{hint}</p>}
    </div>
  );
};

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
);
const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (p) => (
  <select {...p} className={classNames(inputBase, p.className || "")} />
);
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (p) => (
  <input {...p} className={classNames(inputBase, p.className || "")} />
);
const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (p) => (
  <textarea {...p} className={classNames(inputBase, "min-h-[92px]", p.className || "")} />
);

/* --------------------- defaults / mapeadores ---------------------- */
const defaultEvent = (): EventForm => ({
  kind: "EVENTO",
  title: "",
  description: "",
  category: "",
  priority: "RELEVANTE",
  repeat: "NONE",
  window: "NONE",
  windowStart: "",
  windowEnd: "",
  date: "",
  timeStart: "",
  timeEnd: "",
});

const defaultReminder = (): ReminderForm => ({
  kind: "RECORDATORIO",
  title: "",
  description: "",
  category: "",
  isAllDay: false,
  repeat: "NONE",
  date: "",
  timeStart: "",
  timeEnd: "",
});

// “Map a Prisma-like payload” para EVENTO (no solapable)
import {
  dateAndTimeToDate,
  dateToDateString,
  dateToTimeString,
} from '@/lib/timezone';

// Map para EVENTO (no solapable)
function mapEvent(f: EventForm) {
  const startAt = dateAndTimeToDateLocal(f.date, f.timeStart);
  const endAt = dateAndTimeToDateLocal(f.date, f.timeEnd);
  const windowStartAt = f.window === "RANGO" ? dateStringToStartOfDay(f.windowStart) : null;
  const windowEndAt = f.window === "RANGO" ? dateStringToEndOfDay(f.windowEnd) : null;
  const isAllDay = Boolean(f.date && !f.timeStart && !f.timeEnd);

  const base: any = {
    kind: "EVENTO",
    title: f.title.trim(),
    description: f.description?.trim() || null,
    category: f.category || null,
    priority: f.priority,
    repeat: f.repeat,
    window: f.window,
    windowStart: windowStartAt,
    windowEnd: windowEndAt,
    isAllDay,
  };

  switch (f.priority) {
    case "RECORDATORIO": {
      return {
        ...base,
        participatesInScheduling: false,
        status: "SCHEDULED",
        window: "NONE",
        windowStart: null,
        windowEnd: null,
        start: startAt,
        end: endAt,
      };
    }
    case "OPCIONAL": {
      return {
        ...base,
        status: "WAITLIST",
        participatesInScheduling: false,
        window: "NONE",
        windowStart: null,
        windowEnd: null,
        start: null,
        end: null,
      };
    }
    case "CRITICA": {
      return {
        ...base,
        isFixed: true,
        participatesInScheduling: true,
        transparency: "OPAQUE",
        start: startAt,
        end: endAt,
      };
    }
    default: {
      return {
        ...base,
        isFixed: false,
        participatesInScheduling: true,
        transparency: "OPAQUE",
        start: startAt,
        end: endAt,
      };
    }
  }
}

// Map para RECORDATORIO (solapable, sin solver)
function mapReminder(f: ReminderForm) {
  const start = f.date
    ? f.isAllDay
      ? dateAndTimeToDateLocal(f.date, "00:00")
      : dateAndTimeToDateLocal(f.date, f.timeStart)
    : null;

  const end = f.isAllDay
    ? null
    : f.date && f.timeEnd
    ? dateAndTimeToDateLocal(f.date, f.timeEnd)
    : null;

  debugDateFull('mapReminder START', start);
  debugDateFull('mapReminder END', end);

  return {
    kind: "RECORDATORIO",
    title: f.title.trim(),
    description: f.description?.trim() || null,
    category: f.category || null,
    shareLink: f.shareLink,
    window: f.window,
    windowStart: f.window === "RANGO" ? dateStringToStartOfDay(f.windowStart) : null,
    windowEnd: f.window === "RANGO" ? dateStringToEndOfDay(f.windowEnd) : null,
    start: dateAndTimeToDateLocal(f.date, f.timeStart),
    end: dateAndTimeToDateLocal(f.date, f.timeEnd),
    participatesInScheduling: true,
  };
}

/* ------------------------- formularios --------------------------- */
const Tabs: React.FC<{
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ tabs, value, onChange }) => (
  <div className="mb-4 flex gap-2">
    {tabs.map((t) => (
      <button
        key={t.id}
        className={classNames(
          "px-3 py-1.5 rounded-xl border text-sm transition",
          value === t.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
        )}
        onClick={() => onChange(t.id)}
        type="button"
      >
        {t.label}
      </button>
    ))}
  </div>
);

const CrearEvento: React.FC<{ initial?: Partial<EventForm>; onSubmit: (data: any) => void }> = ({ initial, onSubmit }) => {
  const initEvent = useMemo<EventForm>(() => ({ ...defaultEvent(), ...(initial ?? {}) }), [initial]);
  const [f, set] = useState<EventForm>(initEvent);

  useEffect(() => {
    if (initial?.date || initial?.timeStart) {
      console.log('🔍 CrearEvento - Valores iniciales recibidos:', {
        date: initial.date,
        timeStart: initial.timeStart,
        timeEnd: initial.timeEnd,
        formState: {
          date: f.date,
          timeStart: f.timeStart,
          timeEnd: f.timeEnd,
        },
      });
    }
  }, [initial?.date, initial?.timeStart, initial?.timeEnd]);


  const isCritica = f.priority === "CRITICA";
  const isUrgRel = f.priority === "URGENTE" || f.priority === "RELEVANTE";
  const isOpcional = f.priority === "OPCIONAL";
  const isReminder = f.priority === "RECORDATORIO";
  const canSubmit = f.title.trim().length > 0 && (!isCritica || (f.date && f.timeStart && f.timeEnd));

  return (
    <div className="space-y-4">
      <Row>
        <Field label="Título" labelIcon={<TypeIcon className="h-4 w-4" />}>
          <Input value={f.title} onChange={(e) => set({ ...f, title: e.target.value })} placeholder="Nombre del evento" />
        </Field>
        <Field label="Categoría" labelIcon={<FolderOpen className="h-4 w-4" />}>
          <Select value={f.category ?? ""} onChange={(e) => set({ ...f, category: e.target.value })}>
            <option value="" disabled>Selecciona una categoría…</option>
            <option value="Escuela">Escuela</option>
            <option value="Trabajo">Trabajo</option>
            <option value="Personal">Personal</option>
          </Select>
        </Field>
      </Row>

      <Field label="Descripción" labelIcon={<FileText className="h-4 w-4" />}>
        <Textarea value={f.description} onChange={(e) => set({ ...f, description: e.target.value })} placeholder="Opcional" />
      </Field>

      <Row>
        <Field label="Prioridad" labelIcon={<Flag className="h-4 w-4" />}>
          <Select value={f.priority} onChange={(e) => set({ ...f, priority: e.target.value as Priority })}>
            <option value="CRITICA">Crítica</option>
            <option value="URGENTE">Urgente</option>
            <option value="RELEVANTE">Relevante</option>
            <option value="OPCIONAL">Opcional</option>
            <option value="RECORDATORIO">Recordatorio</option>
          </Select>
        </Field>
        <div />
      </Row>

      {isCritica && (
        <>
          <Row>
            <Field label="Fecha" labelIcon={<Calendar className="h-4 w-4" />}>
              <Input type="date" value={f.date} onChange={(e) => set({ ...f, date: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Hora inicio" labelIcon={<Clock className="h-4 w-4" />}>
                <Input type="time" value={f.timeStart} onChange={(e) => set({ ...f, timeStart: e.target.value })} />
              </Field>
              <Field label="Hora fin" labelIcon={<Clock className="h-4 w-4" />}>
                <Input type="time" value={f.timeEnd} onChange={(e) => set({ ...f, timeEnd: e.target.value })} />
              </Field>
            </div>
          </Row>
          <Row>
            <Field label="Repetición" labelIcon={<RepeatIcon className="h-4 w-4" />}>
              <Select value={f.repeat} onChange={(e) => set({ ...f, repeat: e.target.value as RepeatRule })}>
                <option value="NONE">No repetir</option>
                <option value="DAILY">Diario</option>
                <option value="WEEKLY">Semanal</option>
                <option value="MONTHLY">Mensual</option>
                <option value="YEARLY">Anual</option>
              </Select>
            </Field>
            <div />
          </Row>
        </>
      )}

      {isUrgRel && (
        <>
          <Row>
            <Field label="Disponibilidad" labelIcon={<CalendarRange className="h-4 w-4" />}>
              <Select value={f.window} onChange={(e) => set({ ...f, window: e.target.value as AvailabilityWindow })}>
                <option value="PRONTO">Pronto</option>
                <option value="SEMANA">Esta semana</option>
                <option value="MES">Este mes</option>
                <option value="RANGO">Rango personalizado</option>
                <option value="NONE">Sin preferencia</option>
              </Select>
            </Field>
            {f.window === "RANGO" && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Inicio" labelIcon={<Calendar className="h-4 w-4" />}>
                  <Input type="date" value={f.windowStart} onChange={(e) => set({ ...f, windowStart: e.target.value })} />
                </Field>
                <Field label="Fin" labelIcon={<Calendar className="h-4 w-4" />}>
                  <Input type="date" value={f.windowEnd} onChange={(e) => set({ ...f, windowEnd: e.target.value })} />
                </Field>
              </div>
            )}
          </Row>
          <Row>
            <Field label="Fecha (opcional)" labelIcon={<Calendar className="h-4 w-4" />}>
              <Input type="date" value={f.date} onChange={(e) => set({ ...f, date: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Hora inicio (opcional)" labelIcon={<Clock className="h-4 w-4" />}>
                <Input type="time" value={f.timeStart} onChange={(e) => set({ ...f, timeStart: e.target.value })} />
              </Field>
              <Field label="Hora fin (opcional)" labelIcon={<Clock className="h-4 w-4" />}>
                <Input type="time" value={f.timeEnd} onChange={(e) => set({ ...f, timeEnd: e.target.value })} />
              </Field>
            </div>
          </Row>
          <Row>
            <Field label="Repetición" labelIcon={<RepeatIcon className="h-4 w-4" />}>
              <Select value={f.repeat} onChange={(e) => set({ ...f, repeat: e.target.value as RepeatRule })}>
                <option value="NONE">No repetir</option>
                <option value="DAILY">Diario</option>
                <option value="WEEKLY">Semanal</option>
                <option value="MONTHLY">Mensual</option>
                <option value="YEARLY">Anual</option>
              </Select>
            </Field>
            <div />
          </Row>
        </>
      )}

      {isReminder && (
        <>
          <Row>
            <Field label="Fecha" labelIcon={<Calendar className="h-4 w-4" />}> 
              <Input type="date" value={f.date} onChange={(e) => set({ ...f, date: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Hora inicio" labelIcon={<Clock className="h-4 w-4" />}>
                <Input type="time" value={f.timeStart} onChange={(e) => set({ ...f, timeStart: e.target.value })} />
              </Field>
              <Field label="Hora fin" labelIcon={<Clock className="h-4 w-4" />}>
                <Input type="time" value={f.timeEnd} onChange={(e) => set({ ...f, timeEnd: e.target.value })} />
              </Field>
            </div>
          </Row>
          <Row>
            <Field label="Repetición" labelIcon={<RepeatIcon className="h-4 w-4" />}>
              <Select value={f.repeat} onChange={(e) => set({ ...f, repeat: e.target.value as RepeatRule })}>
                <option value="NONE">No repetir</option>
                <option value="DAILY">Diario</option>
                <option value="WEEKLY">Semanal</option>
                <option value="MONTHLY">Mensual</option>
                <option value="YEARLY">Anual</option>
              </Select>
            </Field>
          </Row>
        </>
      )}

      {isReminder && (
        <>
          <Row>
            <Field label="Fecha" labelIcon={<Calendar className="h-4 w-4" />}> 
              <Input type="date" value={f.date} onChange={(e) => set({ ...f, date: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Hora inicio" labelIcon={<Clock className="h-4 w-4" />}>
                <Input type="time" value={f.timeStart} onChange={(e) => set({ ...f, timeStart: e.target.value })} />
              </Field>
              <Field label="Hora fin" labelIcon={<Clock className="h-4 w-4" />}>
                <Input type="time" value={f.timeEnd} onChange={(e) => set({ ...f, timeEnd: e.target.value })} />
              </Field>
            </div>
          </Row>
          <Row>
            <Field label="Repetición" labelIcon={<RepeatIcon className="h-4 w-4" />}>
              <Select value={f.repeat} onChange={(e) => set({ ...f, repeat: e.target.value as RepeatRule })}>
                <option value="NONE">No repetir</option>
                <option value="DAILY">Diario</option>
                <option value="WEEKLY">Semanal</option>
                <option value="MONTHLY">Mensual</option>
                <option value="YEARLY">Anual</option>
              </Select>
            </Field>
          </Row>
        </>
      )}

      {isOpcional && <p className={subtle}>Este elemento irá a la lista de espera y no requiere fecha u hora.</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button className={button} type="button" onClick={() => set(initEvent)}>
          Limpiar
        </button>
        <button
          className={classNames(primary, !canSubmit && "opacity-50 cursor-not-allowed")}
          disabled={!canSubmit}
          onClick={() => onSubmit(mapEvent(f))}
          type="button"
        >
          Guardar
        </button>
      </div>
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-800 font-mono">
          <div>Fecha: {f.date || '(vacío)'}</div>
          <div>Hora inicio: {f.timeStart || '(vacío)'}</div>
          <div>Hora fin: {f.timeEnd || '(vacío)'}</div>
        </div>
      )}
    </div>
  );
};

const CrearRecordatorio: React.FC<{ initial?: Partial<ReminderForm>; onSubmit: (data: any) => void }> = ({ initial, onSubmit }) => {
  const initReminder = useMemo<ReminderForm>(() => ({ ...defaultReminder(), ...(initial ?? {}) }), [initial]);
  const [f, set] = useState<ReminderForm>(initReminder);

  const canSubmit =
    f.title.trim().length > 0 &&
    f.date &&
    (f.isAllDay ? true : Boolean(f.timeStart));

  return (
    <div className="space-y-4">
      <Row>
        <Field label="Título" labelIcon={<TypeIcon className="h-4 w-4" />}>
          <Input value={f.title} onChange={(e) => set({ ...f, title: e.target.value })} placeholder="Ej. Reunión virtual, Cumpleaños, Nota" />
        </Field>
        <Field label="Categoría" labelIcon={<FolderOpen className="h-4 w-4" />}>
          <Select value={f.category ?? ""} onChange={(e) => set({ ...f, category: e.target.value })}>
            <option value="" disabled>Selecciona una categoría…</option>
            <option value="Escuela">Escuela</option>
            <option value="Trabajo">Trabajo</option>
            <option value="Personal">Personal</option>
          </Select>
        </Field>
      </Row>

      <Field label="Descripción" labelIcon={<FileText className="h-4 w-4" />}>
        <Textarea value={f.description} onChange={(e) => set({ ...f, description: e.target.value })} placeholder="Opcional" />
      </Field>

      <Row>
        <Field label="Fecha" labelIcon={<Calendar className="h-4 w-4" />}>
          <Input type="date" value={f.date} onChange={(e) => set({ ...f, date: e.target.value })} />
        </Field>
        <div className="flex items-end gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={f.isAllDay}
              onChange={(e) => set({ ...f, isAllDay: e.target.checked })}
            />
            Todo el día
          </label>
        </div>
      </Row>

      {!f.isAllDay && (
        <Row>
          <Field label="Hora inicio" labelIcon={<Clock className="h-4 w-4" />}>
            <Input type="time" value={f.timeStart} onChange={(e) => set({ ...f, timeStart: e.target.value })} />
          </Field>
          <Field label="Hora fin (opcional)" labelIcon={<Clock className="h-4 w-4" />}>
            <Input type="time" value={f.timeEnd} onChange={(e) => set({ ...f, timeEnd: e.target.value })} />
          </Field>
        </Row>
      )}

      <Row>
        <Field label="Repetición" labelIcon={<RepeatIcon className="h-4 w-4" />}>
          <Select value={f.repeat} onChange={(e) => set({ ...f, repeat: e.target.value as RepeatRule })}>
            <option value="NONE">No repetir</option>
            <option value="DAILY">Diario</option>
            <option value="WEEKLY">Semanal</option>
            <option value="MONTHLY">Mensual</option>
            <option value="YEARLY">Anual</option>
          </Select>
        </Field>
        <div />
      </Row>

      <p className={subtle}>
        Los recordatorios pueden solaparse y no usan el motor de disponibilidad. Son notas visibles en el calendario.
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <button className={button} type="button" onClick={() => set(initReminder)}>
          Limpiar
        </button>
        <button
          className={classNames(primary, !canSubmit && "opacity-50 cursor-not-allowed")}
          disabled={!canSubmit}
          onClick={() => onSubmit(mapReminder(f))}
          type="button"
        >
          Guardar
        </button>
      </div>
    </div>
  );
};

/* ------------------------ componente principal -------------------- */
export default function CreateEditModal({
  open,
  mode = "create",
  initialTab = "evento",
  initialValues,
  title,
  onSubmit,
  onClose,
}: Props) {
  const [tab, setTab] = useState<"evento" | "recordatorio">(initialTab);
  const derivedTitle = title ?? (mode === "edit" ? "Editar" : "Crear");

  return (
    <ModalShell open={open} onClose={onClose} title={derivedTitle}>
      <Tabs
        tabs={[
          { id: "evento", label: mode === "edit" ? "Editar Evento" : "Crear Evento" },
          { id: "recordatorio", label: mode === "edit" ? "Editar Recordatorio" : "Crear Recordatorio" },
        ]}
        value={tab}
        onChange={(v) => setTab(v as any)}
      />

      {tab === "evento" && (
        <CrearEvento
          initial={{ kind: "EVENTO", ...(initialValues ?? {}) }}
          onSubmit={onSubmit}
        />
      )}

      {tab === "recordatorio" && (
        <CrearRecordatorio
          initial={{ kind: "RECORDATORIO", ...(initialValues ?? {}) }}
          onSubmit={onSubmit}
        />
      )}
    </ModalShell>
  );
}
