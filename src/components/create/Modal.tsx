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
  durationHours: string;
  durationMinutes: string;
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
  durationMinutes: number | null;
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

/* ── estilos base ── */
const cx = (...xs: (string | false | undefined)[]) => xs.filter(Boolean).join(" ");
const inputBase =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 transition focus:outline-none focus:ring-2 focus:ring-indigo-300/60 focus:border-indigo-400";
const labelBase = "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500";
const btnSecondary =
  "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition";
const btnPrimary =
  "inline-flex items-center justify-center rounded-xl bg-slate-900 text-white px-5 py-2 text-sm font-semibold hover:bg-slate-800 active:bg-slate-700 transition";

/* ── subcomponentes UI ── */
const ModalShell: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, children }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ y: 24, scale: 0.97, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 24, scale: 0.97, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
          className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-xl overflow-hidden"
        >
          {/* header */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={onClose}
              aria-label="Cerrar"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
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
  children: ClassNameChild;
  required?: boolean;
}> = ({ label, hint, labelIcon, children, required }) => (
  <div className="space-y-1.5">
    <label className={labelBase}>
      {labelIcon}
      <span>{label}</span>
      {required && <span className="text-indigo-500">*</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-slate-400">{hint}</p>}
  </div>
);

const Row: React.FC<{ children: React.ReactNode; cols?: 2 | 3 }> = ({ children, cols = 2 }) => (
  <div className={cx("grid gap-3", cols === 3 ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
    {children}
  </div>
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (p) => (
  <select {...p} className={cx(inputBase, "cursor-pointer", p.className || "")} />
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (p) => (
  <input {...p} className={cx(inputBase, p.className || "")} />
);

const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (p) => (
  <textarea {...p} className={cx(inputBase, "min-h-[80px] resize-none", p.className || "")} />
);

/* ── Selector de duración (h + min) ── */
const HOUR_OPTIONS = Array.from({ length: 13 }, (_, i) => i); // 0–12
const MIN_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const DurationPicker: React.FC<{
  hours: string;
  minutes: string;
  onHoursChange: (v: string) => void;
  onMinutesChange: (v: string) => void;
}> = ({ hours, minutes, onHoursChange, onMinutesChange }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1">
      <Select
        value={hours}
        onChange={(e) => onHoursChange(e.target.value)}
        aria-label="Horas de duración"
      >
        {HOUR_OPTIONS.map((h) => (
          <option key={h} value={String(h)}>
            {h}h
          </option>
        ))}
      </Select>
    </div>
    <div className="flex-1">
      <Select
        value={minutes}
        onChange={(e) => onMinutesChange(e.target.value)}
        aria-label="Minutos de duración"
      >
        {MIN_OPTIONS.map((m) => (
          <option key={m} value={String(m)}>
            {m}min
          </option>
        ))}
      </Select>
    </div>
  </div>
);

/* ── hook para cargar categorías ── */
const DEFAULT_CATEGORIES = ["Escuela", "Trabajo", "Personal", "Familia", "Salud"];

function useCategories() {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (Array.isArray(data?.categories) && data.categories.length > 0) {
          setCategories(data.categories);
        }
      })
      .catch(() => {});
  }, []);
  return categories;
}

/* ── defaults / mapeadores ── */
const defaultEvent = (): EventForm => ({
  kind: "EVENTO",
  title: "",
  description: "",
  category: "",
  priority: "CRITICA",
  repeat: "NONE",
  window: "SEMANA",
  windowStart: "",
  windowEnd: "",
  date: "",
  timeStart: "",
  timeEnd: "",
  durationHours: "1",
  durationMinutes: "0",
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

function parseDurationMinutes(hours: string, minutes: string): number {
  const h = parseInt(hours, 10) || 0;
  const m = parseInt(minutes, 10) || 0;
  return h * 60 + m;
}

function mapEvent(f: EventForm, timeZone: string): EventSubmitPayload {
  const startAt = dateAndTimeToDateLocal(f.date, f.timeStart, timeZone);
  const endAt = dateAndTimeToDateLocal(f.date, f.timeEnd, timeZone);
  const windowStartAt = f.window === "RANGO" ? dateStringToStartOfDay(f.windowStart, timeZone) : null;
  const windowEndAt = f.window === "RANGO" ? dateStringToEndOfDay(f.windowEnd, timeZone) : null;
  const isAllDay = Boolean(f.date && !f.timeStart && !f.timeEnd);

  const isUrgentOrRelevant = f.priority === "URGENTE" || f.priority === "RELEVANTE";
  const durationMins = parseDurationMinutes(f.durationHours, f.durationMinutes);
  const durationMinutes = isUrgentOrRelevant && durationMins > 0
    ? durationMins
    : startAt && endAt && endAt.getTime() > startAt.getTime()
      ? Math.max(1, Math.round((endAt.getTime() - startAt.getTime()) / 60000))
      : null;

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
    durationMinutes,
  };

  switch (f.priority) {
    case "CRITICA":
      return { ...base, isFixed: true, start: startAt, end: endAt, durationMinutes };
    case "URGENTE":
    case "RELEVANTE":
      return { ...base, isFixed: false, durationMinutes };
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
        durationMinutes: null,
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
        durationMinutes,
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

/* ── tabs ── */
type TabId = "evento" | "recordatorio";

const Tabs: React.FC<{
  tabs: { id: TabId; label: string }[];
  value: TabId;
  onChange: (v: TabId) => void;
}> = ({ tabs, value, onChange }) => (
  <div className="mb-5 flex gap-1.5 rounded-xl bg-slate-100 p-1">
    {tabs.map((t) => (
      <button
        key={t.id}
        className={cx(
          "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition",
          value === t.id
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-700",
        )}
        onClick={() => onChange(t.id)}
        type="button"
      >
        {t.label}
      </button>
    ))}
  </div>
);

/* ── formulario de evento ── */
const CrearEvento: React.FC<{
  initial?: Partial<EventForm>;
  onSubmit: (data: EventSubmitPayload) => void;
  timeZone: string;
  categories: string[];
}> = ({ initial, onSubmit, timeZone, categories }) => {
  const initEvent = useMemo<EventForm>(() => ({ ...defaultEvent(), ...(initial ?? {}) }), [initial]);
  const [f, set] = useState<EventForm>(initEvent);

  useEffect(() => { set((prev) => ({ ...prev, ...initEvent })); }, [initEvent]);

  const isCritica = f.priority === "CRITICA";
  const isUrgRel = f.priority === "URGENTE" || f.priority === "RELEVANTE";
  const isOpcional = f.priority === "OPCIONAL";
  const isReminder = f.priority === "RECORDATORIO";

  const durationMins = parseDurationMinutes(f.durationHours, f.durationMinutes);
  const hasDuration = isUrgRel ? durationMins > 0 : true;

  const rangeError: string | null = (() => {
    if (!isUrgRel || f.window !== "RANGO") return null;
    if (!f.windowStart || !f.windowEnd) return "Selecciona fecha de inicio y fin del rango.";
    if (f.windowEnd <= f.windowStart) return "La fecha de fin debe ser posterior a la de inicio.";
    return null;
  })();

  const timeOrderError: string | null = (() => {
    if (!isCritica && !isReminder) return null;
    if (!f.timeStart || !f.timeEnd) return null;
    if (f.timeEnd <= f.timeStart) return "La hora de fin debe ser posterior a la hora de inicio.";
    return null;
  })();

  const canSubmit =
    f.title.trim().length > 0 &&
    (!isCritica || (f.date && f.timeStart && f.timeEnd)) &&
    hasDuration &&
    rangeError === null &&
    timeOrderError === null;

  return (
    <div className="space-y-4">
      {/* Título + Categoría */}
      <Row>
        <Field label="Título" labelIcon={<TypeIcon className="h-3.5 w-3.5" />} required>
          <Input
            value={f.title}
            onChange={(e) => set({ ...f, title: e.target.value })}
            placeholder="Nombre del evento"
            autoFocus
          />
        </Field>
        <Field label="Categoría" labelIcon={<FolderOpen className="h-3.5 w-3.5" />}>
          <Select value={f.category ?? ""} onChange={(e) => set({ ...f, category: e.target.value })}>
            <option value="">Sin categoría</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </Select>
        </Field>
      </Row>

      {/* Descripción */}
      <Field label="Descripción" labelIcon={<FileText className="h-3.5 w-3.5" />}>
        <Textarea
          value={f.description}
          onChange={(e) => set({ ...f, description: e.target.value })}
          placeholder="Opcional"
        />
      </Field>

      {/* Prioridad */}
      <Field label="Prioridad" labelIcon={<Flag className="h-3.5 w-3.5" />}>
        <Select
          value={f.priority}
          onChange={(e) => {
            const nextPriority = e.target.value as Priority;
            const next: EventForm = {
              ...f,
              priority: nextPriority,
              repeat: nextPriority === "URGENTE" || nextPriority === "RELEVANTE" ? "NONE" : f.repeat,
            };
            set(next);
          }}
        >
          <option value="CRITICA">Critica — fecha y hora fijas</option>
          <option value="URGENTE">Urgente — proximos dias</option>
          <option value="RELEVANTE">Relevante — esta semana / mes</option>
          <option value="OPCIONAL">Opcional — lista de espera</option>
        </Select>
      </Field>

      {/* Campos CRÍTICA */}
      {isCritica && (
        <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <Row>
            <Field label="Fecha" labelIcon={<Calendar className="h-3.5 w-3.5" />} required>
              <Input type="date" value={f.date} onChange={(e) => set({ ...f, date: e.target.value })} />
            </Field>
            <div />
          </Row>
          <Row>
            <Field label="Hora inicio" labelIcon={<Clock className="h-3.5 w-3.5" />} required>
              <Input type="time" step="300" value={f.timeStart} onChange={(e) => set({ ...f, timeStart: e.target.value })} />
            </Field>
            <Field label="Hora fin" labelIcon={<Clock className="h-3.5 w-3.5" />} required>
              <Input type="time" step="300" value={f.timeEnd} onChange={(e) => set({ ...f, timeEnd: e.target.value })} />
            </Field>
          </Row>
          {timeOrderError && (
            <p className="text-xs text-red-500">{timeOrderError}</p>
          )}
          <Field label="Repetición" labelIcon={<RepeatIcon className="h-3.5 w-3.5" />}>
            <Select value={f.repeat} onChange={(e) => set({ ...f, repeat: e.target.value as RepeatRule })}>
              <option value="NONE">No repetir</option>
              <option value="DAILY">Diario</option>
              <option value="WEEKLY">Semanal</option>
              <option value="MONTHLY">Mensual</option>
              <option value="YEARLY">Anual</option>
            </Select>
          </Field>
        </div>
      )}

      {/* Campos URGENTE / RELEVANTE */}
      {isUrgRel && (
        <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <Row>
            <Field label="Disponibilidad" labelIcon={<CalendarRange className="h-3.5 w-3.5" />}>
              <Select value={f.window} onChange={(e) => set({ ...f, window: e.target.value as AvailabilityWindow })}>
                <option value="PRONTO">Pronto (próximos días)</option>
                <option value="SEMANA">Esta semana</option>
                <option value="MES">Este mes</option>
                <option value="RANGO">Rango personalizado</option>
                <option value="NONE">Sin preferencia</option>
              </Select>
            </Field>
            <Field label="Duración" labelIcon={<Clock className="h-3.5 w-3.5" />} required>
              <DurationPicker
                hours={f.durationHours}
                minutes={f.durationMinutes}
                onHoursChange={(v) => set({ ...f, durationHours: v })}
                onMinutesChange={(v) => set({ ...f, durationMinutes: v })}
              />
            </Field>
          </Row>
          {f.window === "RANGO" && (
            <>
              <Row>
                <Field label="Inicio del rango" labelIcon={<Calendar className="h-3.5 w-3.5" />}>
                  <Input type="date" value={f.windowStart} onChange={(e) => set({ ...f, windowStart: e.target.value })} />
                </Field>
                <Field label="Fin del rango" labelIcon={<Calendar className="h-3.5 w-3.5" />}>
                  <Input type="date" value={f.windowEnd} onChange={(e) => set({ ...f, windowEnd: e.target.value })} />
                </Field>
              </Row>
              {rangeError && <p className="text-xs text-red-500">{rangeError}</p>}
            </>
          )}
          {!hasDuration && (
            <p className="text-xs text-amber-600">Selecciona al menos 5 minutos de duración.</p>
          )}
        </div>
      )}

      {/* Campos RECORDATORIO (dentro de evento) */}
      {isReminder && (
        <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <Row>
            <Field label="Fecha" labelIcon={<Calendar className="h-3.5 w-3.5" />}>
              <Input type="date" value={f.date} onChange={(e) => set({ ...f, date: e.target.value })} />
            </Field>
            <div />
          </Row>
          <Row>
            <Field label="Hora inicio" labelIcon={<Clock className="h-3.5 w-3.5" />}>
              <Input type="time" value={f.timeStart} onChange={(e) => set({ ...f, timeStart: e.target.value })} />
            </Field>
            <Field label="Hora fin" labelIcon={<Clock className="h-3.5 w-3.5" />}>
              <Input type="time" value={f.timeEnd} onChange={(e) => set({ ...f, timeEnd: e.target.value })} />
            </Field>
          </Row>
          <Field label="Repetición" labelIcon={<RepeatIcon className="h-3.5 w-3.5" />}>
            <Select value={f.repeat} onChange={(e) => set({ ...f, repeat: e.target.value as RepeatRule })}>
              <option value="NONE">No repetir</option>
              <option value="DAILY">Diario</option>
              <option value="WEEKLY">Semanal</option>
              <option value="MONTHLY">Mensual</option>
              <option value="YEARLY">Anual</option>
            </Select>
          </Field>
        </div>
      )}

      {/* Info OPCIONAL */}
      {isOpcional && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 border border-emerald-100">
          Este evento irá a la <strong>lista de espera</strong> y se agendará cuando haya disponibilidad.
        </p>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-2 pt-1">
        <button className={btnSecondary} type="button" onClick={() => set(defaultEvent())}>
          Limpiar
        </button>
        <button
          className={cx(btnPrimary, !canSubmit && "opacity-40 cursor-not-allowed")}
          disabled={!canSubmit}
          onClick={() => onSubmit(mapEvent(f, timeZone))}
          type="button"
        >
          Guardar evento
        </button>
      </div>
    </div>
  );
};

/* ── formulario de recordatorio ── */
const CrearRecordatorio: React.FC<{
  initial?: Partial<ReminderForm>;
  onSubmit: (data: ReminderSubmitPayload) => void;
  timeZone: string;
  categories: string[];
}> = ({ initial, onSubmit, timeZone, categories }) => {
  const initReminder = useMemo<ReminderForm>(() => ({ ...defaultReminder(), ...(initial ?? {}) }), [initial]);
  const [f, set] = useState<ReminderForm>(initReminder);

  useEffect(() => { set((prev) => ({ ...prev, ...initReminder })); }, [initReminder]);

  const reminderTimeError: string | null = (() => {
    if (f.isAllDay || !f.timeStart || !f.timeEnd) return null;
    if (f.timeEnd <= f.timeStart) return "La hora de fin debe ser posterior a la hora de inicio.";
    return null;
  })();

  const canSubmit =
    f.title.trim().length > 0 &&
    Boolean(f.date) &&
    (f.isAllDay || Boolean(f.timeStart)) &&
    reminderTimeError === null;

  return (
    <div className="space-y-4">
      <Row>
        <Field label="Título" labelIcon={<TypeIcon className="h-3.5 w-3.5" />} required>
          <Input
            value={f.title}
            onChange={(e) => set({ ...f, title: e.target.value })}
            placeholder="Ej. Tomar vitaminas, Llamar al médico"
            autoFocus
          />
        </Field>
        <Field label="Categoría" labelIcon={<FolderOpen className="h-3.5 w-3.5" />}>
          <Select value={f.category ?? ""} onChange={(e) => set({ ...f, category: e.target.value })}>
            <option value="">Sin categoría</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </Select>
        </Field>
      </Row>

      <Field label="Descripción" labelIcon={<FileText className="h-3.5 w-3.5" />}>
        <Textarea
          value={f.description}
          onChange={(e) => set({ ...f, description: e.target.value })}
          placeholder="Opcional"
        />
      </Field>

      <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
        <Row>
          <Field label="Fecha" labelIcon={<Calendar className="h-3.5 w-3.5" />} required>
            <Input type="date" value={f.date} onChange={(e) => set({ ...f, date: e.target.value })} />
          </Field>
          <div className="flex items-end pb-0.5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700 select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400"
                checked={f.isAllDay}
                onChange={(e) => set({ ...f, isAllDay: e.target.checked })}
              />
              <span>Todo el día</span>
            </label>
          </div>
        </Row>

        {!f.isAllDay && (
          <>
            <Row>
              <Field label="Hora inicio" labelIcon={<Clock className="h-3.5 w-3.5" />} required>
                <Input type="time" step="300" value={f.timeStart} onChange={(e) => set({ ...f, timeStart: e.target.value })} />
              </Field>
              <Field label="Hora fin (opcional)" labelIcon={<Clock className="h-3.5 w-3.5" />}>
                <Input type="time" step="300" value={f.timeEnd} onChange={(e) => set({ ...f, timeEnd: e.target.value })} />
              </Field>
            </Row>
            {reminderTimeError && (
              <p className="text-xs text-red-500">{reminderTimeError}</p>
            )}
          </>
        )}

        <Field label="Repetición" labelIcon={<RepeatIcon className="h-3.5 w-3.5" />}>
          <Select value={f.repeat} onChange={(e) => set({ ...f, repeat: e.target.value as RepeatRule })}>
            <option value="NONE">No repetir</option>
            <option value="DAILY">Diario</option>
            <option value="WEEKLY">Semanal</option>
            <option value="MONTHLY">Mensual</option>
            <option value="YEARLY">Anual</option>
          </Select>
        </Field>
      </div>

      <p className="text-xs text-slate-400">
        Los recordatorios se muestran en el calendario y pueden coexistir con otros eventos.
      </p>

      <div className="flex justify-end gap-2 pt-1">
        <button className={btnSecondary} type="button" onClick={() => set(defaultReminder())}>
          Limpiar
        </button>
        <button
          className={cx(btnPrimary, !canSubmit && "opacity-40 cursor-not-allowed")}
          disabled={!canSubmit}
          onClick={() => onSubmit(mapReminder(f, timeZone))}
          type="button"
        >
          Guardar recordatorio
        </button>
      </div>
    </div>
  );
};

/* ── componente principal ── */
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
  const derivedTitle = title ?? (mode === "edit" ? "Editar" : "Nuevo");
  const timeZone = useMemo(() => resolveBrowserTimezone(), []);
  const categories = useCategories();

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [initialTab, open]);

  const isReminderInitial = initialValues && "kind" in initialValues && initialValues.kind === "RECORDATORIO";
  const eventInitial = !isReminderInitial ? (initialValues as Partial<EventForm> | undefined) : undefined;
  const reminderInitial = isReminderInitial ? (initialValues as Partial<ReminderForm>) : undefined;

  return (
    <ModalShell open={open} onClose={onClose} title={derivedTitle}>
      <Tabs
        tabs={[
          { id: "evento", label: mode === "edit" ? "Editar Evento" : "Evento" },
          { id: "recordatorio", label: mode === "edit" ? "Editar Recordatorio" : "Recordatorio" },
        ]}
        value={tab}
        onChange={(v) => setTab(v)}
      />

      {tab === "evento" && (
        <CrearEvento
          initial={{ ...(eventInitial ?? {}), kind: "EVENTO" }}
          onSubmit={onSubmit}
          timeZone={timeZone}
          categories={categories}
        />
      )}

      {tab === "recordatorio" && (
        <CrearRecordatorio
          initial={{ ...(reminderInitial ?? {}), kind: "RECORDATORIO" }}
          onSubmit={onSubmit}
          timeZone={timeZone}
          categories={categories}
        />
      )}
    </ModalShell>
  );
}
