'use client';

import { useMemo, useState, type FormEvent } from 'react';

import {
  DAY_CODES,
  DAY_LABELS,
  DEFAULT_USER_SETTINGS,
  TIMEZONE_GROUPS,
  type DayCode,
  type UserSettingsValues,
} from '@/lib/user-settings';

type SettingsFormProps = {
  initialValues: UserSettingsValues;
};

function clampMinutes(value: string, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.round(num));
}

function clampBufferMinutes(value: string, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  const rounded = Math.round(num);
  if (rounded === 0) return 0;
  return Math.round(rounded / 5) * 5;
}

export default function SettingsForm({ initialValues }: SettingsFormProps) {
  const [form, setForm] = useState<UserSettingsValues>(initialValues);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const [reoptStatus, setReoptStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [reoptMessage, setReoptMessage] = useState<string | null>(null);

  const enabledSet = useMemo(() => new Set(form.enabledDays), [form.enabledDays]);

  const timeRangeError = useMemo(() => {
    if (!form.dayStart || !form.dayEnd) return null;
    return form.dayEnd <= form.dayStart
      ? 'La hora de fin debe ser posterior a la hora de inicio.'
      : null;
  }, [form.dayStart, form.dayEnd]);

  function toggleDay(code: DayCode) {
    setForm((prev) => {
      const current = new Set(prev.enabledDays);
      if (current.has(code)) {
        if (current.size === 1) {
          return prev; // al menos un día debe quedar habilitado
        }
        current.delete(code);
      } else {
        current.add(code);
      }
      const ordered = DAY_CODES.filter((d) => current.has(d));
      return { ...prev, enabledDays: ordered.length ? ordered : prev.enabledDays };
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo guardar');
      }
      const data = (await res.json()) as UserSettingsValues;
      setForm(data);
      setMessage('Preferencias guardadas correctamente.');
      setSavedOnce(true);
      setReoptStatus('idle');
      setReoptMessage(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleReoptimize() {
    setReoptStatus('loading');
    setReoptMessage(null);
    try {
      const res = await fetch('/api/schedule/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo optimizar');
      }
      const data = await res.json();
      const count =
        typeof data?.relocated === 'number'
          ? data.relocated
          : typeof data?.moved === 'number'
            ? data.moved
            : null;
      setReoptMessage(
        count !== null
          ? `Optimización completa: ${count} evento${count !== 1 ? 's' : ''} reubicado${count !== 1 ? 's' : ''}.`
          : 'Optimización completa.',
      );
      setReoptStatus('done');
    } catch (err) {
      setReoptMessage(err instanceof Error ? err.message : 'Error al optimizar');
      setReoptStatus('error');
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-8 rounded-3xl border border-slate-200/70 bg-[var(--surface)]/80 p-6 shadow-sm"
    >
      {/* Horario del día */}
      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--fg)]">Horario del día</h2>
          <p className="text-sm text-[var(--muted)]">
            Define el rango horario que se mostrará destacado en el calendario y que el solver
            priorizará por omisión.
          </p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--fg)]">Inicio del día</span>
            <input
              type="time"
              value={form.dayStart}
              onChange={(e) => setForm((prev) => ({ ...prev, dayStart: e.target.value || prev.dayStart }))}
              className="rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-[var(--fg)] shadow-inner focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--fg)]">Fin del día</span>
            <input
              type="time"
              value={form.dayEnd}
              onChange={(e) => setForm((prev) => ({ ...prev, dayEnd: e.target.value || prev.dayEnd }))}
              className="rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-[var(--fg)] shadow-inner focus:border-indigo-400 focus:outline-none"
            />
          </label>
        </div>
        {timeRangeError && (
          <p className="text-xs text-rose-600">{timeRangeError}</p>
        )}
      </section>

      {/* Días habilitados */}
      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--fg)]">Días habilitados</h2>
          <p className="text-sm text-[var(--muted)]">
            Selecciona los días que se considerarán para agendar automáticamente.
          </p>
        </header>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DAY_CODES.map((code) => (
            <label
              key={code}
              className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2 text-sm font-medium text-[var(--fg)] shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400"
                checked={enabledSet.has(code)}
                onChange={() => toggleDay(code)}
              />
              <span>{DAY_LABELS[code]}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Zona horaria */}
      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--fg)]">Zona horaria</h2>
          <p className="text-sm text-[var(--muted)]">
            Se usa para interpretar correctamente tus horarios y sugerencias.
          </p>
        </header>
        <select
          value={form.timezone}
          onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
          className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-[var(--fg)] shadow-inner focus:border-indigo-400 focus:outline-none sm:w-auto"
        >
          {TIMEZONE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.zones.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </section>

      {/* Reglas del solver */}
      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--fg)]">Reglas del solver</h2>
          <p className="text-sm text-[var(--muted)]">
            Ajusta los márgenes mínimos que se respetarán al programar eventos.
          </p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--fg)]">Tiempo de espera entre eventos (min)</span>
            <input
              type="number"
              min={0}
              step={5}
              value={form.eventBufferMinutes}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  eventBufferMinutes: clampBufferMinutes(e.target.value, prev.eventBufferMinutes),
                }))
              }
              className="rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-[var(--fg)] shadow-inner focus:border-indigo-400 focus:outline-none"
            />
            <span className="text-xs text-[var(--muted)]">Debe ser 0 o múltiplo de 5</span>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--fg)]">Antelación mínima desde ahora (min)</span>
            <input
              type="number"
              min={0}
              value={form.schedulingLeadMinutes}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  schedulingLeadMinutes: clampMinutes(e.target.value, prev.schedulingLeadMinutes),
                }))
              }
              className="rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-[var(--fg)] shadow-inner focus:border-indigo-400 focus:outline-none"
            />
          </label>
        </div>
      </section>

      {/* Preferencias del solver */}
      <section className="space-y-5">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--fg)]">Preferencias del solver</h2>
          <p className="text-sm text-[var(--muted)]">
            Indica cómo debe comportarse la optimización automática de tu agenda.
          </p>
        </header>

        {/* Estabilidad de eventos */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--fg)]">Estabilidad de eventos</p>
          <p className="text-xs text-[var(--muted)]">
            ¿Con qué frecuencia puede el solver mover tus eventos ya agendados?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                [1, 'Flexible', 'Puede moverlos libremente'],
                [2, 'Balanceado', 'Solo si es necesario'],
                [3, 'Fijo', 'Evita moverlos al máximo'],
              ] as const
            ).map(([level, label, desc]) => (
              <label
                key={level}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-2xl border px-3 py-2.5 text-sm transition hover:-translate-y-0.5 ${
                  form.weightStability === level
                    ? 'border-indigo-400 bg-indigo-50/70 text-indigo-700'
                    : 'border-slate-200/70 bg-white/70 text-[var(--fg)]'
                }`}
              >
                <input
                  type="radio"
                  name="weightStability"
                  value={level}
                  checked={form.weightStability === level}
                  onChange={() => setForm((prev) => ({ ...prev, weightStability: level }))}
                  className="sr-only"
                />
                <span className="font-medium">{label}</span>
                <span className="text-xs text-[var(--muted)]">{desc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Urgencia de eventos */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--fg)]">Urgencia de eventos</p>
          <p className="text-xs text-[var(--muted)]">
            ¿Qué tan pronto deben quedar agendados los eventos pendientes?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                [1, 'Relajado', 'Cuando haya espacio libre'],
                [2, 'Balanceado', 'Pronto, pero flexible'],
                [3, 'Inmediato', 'Lo antes posible'],
              ] as const
            ).map(([level, label, desc]) => (
              <label
                key={level}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-2xl border px-3 py-2.5 text-sm transition hover:-translate-y-0.5 ${
                  form.weightUrgency === level
                    ? 'border-indigo-400 bg-indigo-50/70 text-indigo-700'
                    : 'border-slate-200/70 bg-white/70 text-[var(--fg)]'
                }`}
              >
                <input
                  type="radio"
                  name="weightUrgency"
                  value={level}
                  checked={form.weightUrgency === level}
                  onChange={() => setForm((prev) => ({ ...prev, weightUrgency: level }))}
                  className="sr-only"
                />
                <span className="font-medium">{label}</span>
                <span className="text-xs text-[var(--muted)]">{desc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Horario laboral */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--fg)]">Horario laboral</p>
          <p className="text-xs text-[var(--muted)]">
            ¿Qué tan importante es mantener eventos dentro del horario definido?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                [1, 'Flexible', 'Puede salirse del horario'],
                [2, 'Preferido', 'Prefiere el horario definido'],
                [3, 'Estricto', 'Solo dentro del horario'],
              ] as const
            ).map(([level, label, desc]) => (
              <label
                key={level}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-2xl border px-3 py-2.5 text-sm transition hover:-translate-y-0.5 ${
                  form.weightWorkHours === level
                    ? 'border-indigo-400 bg-indigo-50/70 text-indigo-700'
                    : 'border-slate-200/70 bg-white/70 text-[var(--fg)]'
                }`}
              >
                <input
                  type="radio"
                  name="weightWorkHours"
                  value={level}
                  checked={form.weightWorkHours === level}
                  onChange={() => setForm((prev) => ({ ...prev, weightWorkHours: level }))}
                  className="sr-only"
                />
                <span className="font-medium">{label}</span>
                <span className="text-xs text-[var(--muted)]">{desc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Cruzar días */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--fg)]">Cruzar días</p>
          <p className="text-xs text-[var(--muted)]">
            ¿Puede el solver extender un evento al día siguiente si no cabe en uno solo?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                [1, 'Permitido', 'Puede cruzar días'],
                [2, 'Evitarlo', 'Prefiere no cruzar días'],
                [3, 'Nunca', 'Nunca cruzar días'],
              ] as const
            ).map(([level, label, desc]) => (
              <label
                key={level}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-2xl border px-3 py-2.5 text-sm transition hover:-translate-y-0.5 ${
                  form.weightCrossDay === level
                    ? 'border-indigo-400 bg-indigo-50/70 text-indigo-700'
                    : 'border-slate-200/70 bg-white/70 text-[var(--fg)]'
                }`}
              >
                <input
                  type="radio"
                  name="weightCrossDay"
                  value={level}
                  checked={form.weightCrossDay === level}
                  onChange={() => setForm((prev) => ({ ...prev, weightCrossDay: level }))}
                  className="sr-only"
                />
                <span className="font-medium">{label}</span>
                <span className="text-xs text-[var(--muted)]">{desc}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {(message || error) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            message
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {message ?? error}
        </div>
      )}

      {savedOnce && (
        <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-indigo-800">
              Las nuevas preferencias se aplicarán a futuros eventos.
            </p>
            <p className="text-sm text-indigo-700">
              ¿Deseas re-optimizar tu agenda ahora con las nuevas preferencias?
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReoptimize}
              disabled={reoptStatus === 'loading'}
              className="inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:opacity-60"
            >
              {reoptStatus === 'loading' ? 'Optimizando…' : 'Re-optimizar'}
            </button>
            {reoptMessage && (
              <span
                className={`text-sm ${reoptStatus === 'error' ? 'text-rose-600' : 'text-emerald-700'}`}
              >
                {reoptMessage}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          className="inline-flex items-center rounded-full border border-slate-200/70 bg-white/70 px-4 py-2 text-sm font-medium text-[var(--fg)] shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
          onClick={() => {
            setMessage(null);
            setError(null);
            setForm({
              ...DEFAULT_USER_SETTINGS,
              enabledDays: [...DEFAULT_USER_SETTINGS.enabledDays],
            });
          }}
        >
          Restaurar valores por defecto
        </button>
        <button
          type="submit"
          disabled={saving || !!timeRangeError}
          className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar preferencias'}
        </button>
      </div>
    </form>
  );
}
