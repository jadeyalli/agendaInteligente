'use client';

import { useMemo, useState, type FormEvent } from 'react';

import {
  DAY_CODES,
  DAY_LABELS,
  DEFAULT_USER_SETTINGS,
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

export default function SettingsForm({ initialValues }: SettingsFormProps) {
  const [form, setForm] = useState<UserSettingsValues>(initialValues);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabledSet = useMemo(() => new Set(form.enabledDays), [form.enabledDays]);

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-8 rounded-3xl border border-slate-200/70 bg-[var(--surface)]/80 p-6 shadow-sm"
    >
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
      </section>

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
              value={form.eventBufferMinutes}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  eventBufferMinutes: clampMinutes(e.target.value, prev.eventBufferMinutes),
                }))
              }
              className="rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-[var(--fg)] shadow-inner focus:border-indigo-400 focus:outline-none"
            />
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
          disabled={saving}
          className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar preferencias'}
        </button>
      </div>
    </form>
  );
}
