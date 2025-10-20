"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  CalendarRange,
  Clock,
  FileText,
  Flag,
  FolderOpen,
  Repeat as RepeatIcon,
  Type as TypeIcon,
  X,
} from "lucide-react";

import {
  dateAndTimeToDateLocal,
  dateStringToEndOfDay,
  dateStringToStartOfDay,
  resolveBrowserTimezone,
} from "@/lib/timezone";

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
  repeat: RepeatRule;
  isAllDay: boolean;
  date?: string;
  timeStart?: string;
  timeEnd?: string;
};

type EventSubmitPayload = {
  kind: "EVENTO";
  title: string;
  description: string | null;
  category: string | null;
  priority: Priority;
  repeat: RepeatRule;
  window: AvailabilityWindow;
  windowStart: Date | null;
  windowEnd: Date | null;
  start: Date | null;
  end: Date | null;
  isAllDay: boolean;
  participatesInScheduling: boolean;
  isFixed: boolean;
  transparency: "OPAQUE" | "TRANSPARENT" | null;
  status: "SCHEDULED" | "WAITLIST";
  tzid: string;
  calendarId?: string | null;
};

type ReminderSubmitPayload = {
  kind: "RECORDATORIO";
  title: string;
  description: string | null;
  category: string | null;
  repeat: RepeatRule;
  isAllDay: boolean;
  start: Date | null;
  end: Date | null;
  tzid: string;
  calendarId?: string | null;
};

export type CreateModalSubmitPayload = EventSubmitPayload | ReminderSubmitPayload;

type Props = {
  open: boolean;
  mode?: "create" | "edit";
  initialTab?: "evento" | "recordatorio";
  initialValues?: Partial<EventForm> | Partial<ReminderForm>;
  title?: string;
  onSubmit: (payload: CreateModalSubmitPayload) => void;
  onClose: () => void;
};

/* -------------------------- estilos base -------------------------- */
const classNames = (...xs: (string | false | undefined)[]) => xs.filter(Boolean).join(" ");
const card = "bg-white shadow-sm rounded-2xl border border-slate-200";
const inputBase =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";
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
            "relative z-10 w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden",
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
  repeat: "NONE",
  isAllDay: false,
  date: "",
  timeStart: "",
  timeEnd: "",
});

function mapEvent(f: EventForm, timeZone: string): EventSubmitPayload {
  const startAt = dateAndTimeToDateLocal(f.date, f.timeStart, timeZone);
  const endAt = dateAndTimeToDateLocal(f.date, f.timeEnd, timeZone);
  const windowStartAt = f.window === "RANGO" ? dateStringToStartOfDay(f.windowStart, timeZone) : null;
  const windowEndAt = f.window === "RANGO" ? dateStringToEndOfDay(f.windowEnd, timeZone) : null;
  const isAllDay = Boolean(f.date && !f.timeStart && !f.timeEnd);

  const base: EventSubmitPayload = {
    kind: "EVENTO",
    title: f.title.trim(),
    description: f.description?.trim() || null,
    category: f.category?.trim() || null,
    priority: f.priority,
    repeat: f.repeat,
    window: f.window,
    windowStart: windowStartAt,
    windowEnd: windowEndAt,
    isAllDay,
    tzid: timeZone,
    participatesInScheduling: true,
    isFixed: false,
    transparency: "OPAQUE",
    status: "SCHEDULED",
    start: startAt,
    end: endAt,
  };

  switch (f.priority) {
    case "CRITICA":
      return {
        ...base,
        isFixed: true,
        participatesInScheduling: true,
        transparency: "OPAQUE",
        start: startAt,
        end: endAt,
      };
    case "URGENTE":
    case "RELEVANTE":
      return {
        ...base,
        isFixed: false,
        participatesInScheduling: true,
        transparency: "OPAQUE",
      };
    case "OPCIONAL":
      return {
        ...base,
        participatesInScheduling: false,
        status: "WAITLIST",
        start: null,
        end: null,
        window: "NONE",
        windowStart: null,
        windowEnd: null,
      };
    case "RECORDATORIO":
      return {
        ...base,
        participatesInScheduling: false,
        isFixed: false,
        transparency: "TRANSPARENT",
        start: startAt,
        end: endAt,
        window: "NONE",
        windowStart: null,
        windowEnd: null,
      };
    default:
      return base;
  }
}

function mapReminder(f: ReminderForm, timeZone: string): ReminderSubmitPayload {
  const startAt = dateAndTimeToDateLocal(f.date, f.isAllDay ? "00:00" : f.timeStart, timeZone);
  const endAt = f.isAllDay
    ? startAt
    : dateAndTimeToDateLocal(f.date, f.timeEnd || f.timeStart, timeZone);

  return {
    kind: "RECORDATORIO",
    title: f.title.trim(),
    description: f.description?.trim() || null,
    category: f.category?.trim() || null,
    repeat: f.repeat,
    isAllDay: f.isAllDay,
    start: startAt,
    end: endAt,
    tzid: timeZone,
  };
}

/* ------------------------- formularios --------------------------- */
type TabId = "evento" | "recordatorio";

const Tabs: React.FC<{
  tabs: { id: TabId; label: string }[];
  value: TabId;
  onChange: (v: TabId) => void;
}> = ({ tabs, value, onChange }) => (
  <div className="mb-4 flex gap-2">
    {tabs.map((t) => (
      <button
        key={t.id}
        className={classNames(
          "px-3 py-1.5 rounded-xl border text-sm transition",
          value === t.id
            ? "bg-slate-900 text-white border-slate-900"
            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50",
        )}
        onClick={() => onChange(t.id)}
        type="button"
      >
        {t.label}
      </button>
    ))}
  </div>
);

const CrearEvento: React.FC<{ initial?: Partial<EventForm>; onSubmit: (data: EventSubmitPayload) => void; timeZone: string }> = ({
  initial,
  onSubmit,
  timeZone,
}) => {
  const initEvent = useMemo<EventForm>(() => ({ ...defaultEvent(), ...(initial ?? {}) }), [initial]);
  const [f, set] = useState<EventForm>(initEvent);

  useEffect(() => {
    set((prev) => ({ ...prev, ...initEvent }));
  }, [initEvent]);

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
            <option value="" disabled>
              Selecciona una categoría…
            </option>
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
            <div />
          </Row>
          <p className={subtle}>
            Los recordatorios de alta prioridad pueden solaparse con otros eventos y se consideran transparencia &quot;TRANSPARENT&quot;.
          </p>
        </>
      )}

      {isOpcional && <p className={subtle}>Este elemento irá a la lista de espera y no requiere fecha u hora.</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button className={button} type="button" onClick={() => set(defaultEvent())}>
          Limpiar
        </button>
        <button
          className={classNames(primary, !canSubmit && "opacity-50 cursor-not-allowed")}
          disabled={!canSubmit}
          onClick={() => onSubmit(mapEvent(f, timeZone))}
          type="button"
        >
          Guardar
        </button>
      </div>
    </div>
  );
};

const CrearRecordatorio: React.FC<{
  initial?: Partial<ReminderForm>;
  onSubmit: (data: ReminderSubmitPayload) => void;
  timeZone: string;
}> = ({ initial, onSubmit, timeZone }) => {
  const initReminder = useMemo<ReminderForm>(() => ({ ...defaultReminder(), ...(initial ?? {}) }), [initial]);
  const [f, set] = useState<ReminderForm>(initReminder);

  useEffect(() => {
    set((prev) => ({ ...prev, ...initReminder }));
  }, [initReminder]);

  const canSubmit =
    f.title.trim().length > 0 &&
    Boolean(f.date) &&
    (f.isAllDay || Boolean(f.timeStart));

  return (
    <div className="space-y-4">
      <Row>
        <Field label="Título" labelIcon={<TypeIcon className="h-4 w-4" />}>
          <Input value={f.title} onChange={(e) => set({ ...f, title: e.target.value })} placeholder="Ej. Pagar servicio, Tomar agua" />
        </Field>
        <Field label="Categoría" labelIcon={<FolderOpen className="h-4 w-4" />}>
          <Select value={f.category ?? ""} onChange={(e) => set({ ...f, category: e.target.value })}>
            <option value="" disabled>
              Selecciona una categoría…
            </option>
            <option value="Personal">Personal</option>
            <option value="Trabajo">Trabajo</option>
            <option value="Salud">Salud</option>
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

      <p className={subtle}>Los recordatorios se muestran como notas rápidas y pueden coexistir con otros eventos.</p>

      <div className="flex justify-end gap-2 pt-2">
        <button className={button} type="button" onClick={() => set(defaultReminder())}>
          Limpiar
        </button>
        <button
          className={classNames(primary, !canSubmit && "opacity-50 cursor-not-allowed")}
          disabled={!canSubmit}
          onClick={() => onSubmit(mapReminder(f, timeZone))}
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
  const [tab, setTab] = useState<TabId>(initialTab);
  const derivedTitle = title ?? (mode === "edit" ? "Editar" : "Crear");
  const timeZone = useMemo(() => resolveBrowserTimezone(), []);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
    }
  }, [initialTab, open]);

  const isReminderInitial = initialValues && "kind" in initialValues && initialValues.kind === "RECORDATORIO";
  const eventInitial = !isReminderInitial ? (initialValues as Partial<EventForm> | undefined) : undefined;
  const reminderInitial = isReminderInitial ? (initialValues as Partial<ReminderForm>) : undefined;

  return (
    <ModalShell open={open} onClose={onClose} title={derivedTitle}>
      <Tabs
        tabs={[
          { id: "evento", label: mode === "edit" ? "Editar Evento" : "Crear Evento" },
          { id: "recordatorio", label: mode === "edit" ? "Editar Recordatorio" : "Crear Recordatorio" },
        ]}
        value={tab}
        onChange={(v) => setTab(v)}
      />

      {tab === "evento" && (
        <CrearEvento initial={{ ...(eventInitial ?? {}), kind: "EVENTO" }} onSubmit={onSubmit} timeZone={timeZone} />
      )}

      {tab === "recordatorio" && (
        <CrearRecordatorio initial={{ ...(reminderInitial ?? {}), kind: "RECORDATORIO" }} onSubmit={onSubmit} timeZone={timeZone} />
      )}
    </ModalShell>
  );
}
