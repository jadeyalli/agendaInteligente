'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  DAY_CODES,
  DAY_LABELS,
  DEFAULT_USER_SETTINGS,
  TIMEZONE_GROUPS,
  type DayCode,
  type UserSettingsValues,
} from '@/lib/user-settings';

// ─── Reservaciones recurrentes ──────────────────────────────────────────────

const JS_DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface RecurringReservation {
  id: string;
  title: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

function RecurringReservationsSection() {
  const [reservations, setReservations] = useState<RecurringReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '10:00',
  });

  const loadReservations = useCallback(async () => {
    try {
      const res = await fetch('/api/reservations?recurring=true');
      if (!res.ok) return;
      const data = await res.json() as { reservations: RecurringReservation[] };
      setReservations(data.reservations ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReservations(); }, [loadReservations]);

  async function handleAdd() {
    if (form.endTime <= form.startTime) {
      setError('La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRecurring: true, ...form, title: form.title || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Error al guardar');
      }
      setForm({ title: '', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      await loadReservations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/reservations/${id}`, { method: 'DELETE' });
      setReservations((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // silent
    }
  }

  return (
    <section className="space-y-3 rounded-3xl border border-slate-200/70 bg-[var(--surface)]/80 p-6 shadow-sm">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-[var(--fg)]">Reservaciones recurrentes</h2>
        <p className="text-sm text-[var(--muted)]">
          Bloquea horarios que se repiten cada semana (reuniones fijas, clases, etc.).
          El solver no agendará eventos en estos bloques.
        </p>
      </header>

      {/* Lista actual */}
      {!loading && reservations.length > 0 && (
        <div className="space-y-2">
          {reservations.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 text-sm"
            >
              <span className="w-20 shrink-0 font-medium text-[var(--fg)]">
                {JS_DAY_LABELS[r.dayOfWeek]}
              </span>
              <span className="text-[var(--muted)]">
                {r.startTime} – {r.endTime}
              </span>
              {r.title && (
                <span className="flex-1 truncate text-[var(--muted)]">{r.title}</span>
              )}
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                className="ml-auto rounded px-2 py-0.5 text-xs text-rose-500 hover:bg-rose-50"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
      {!loading && reservations.length === 0 && (
        <p className="text-sm text-[var(--muted)]">Sin reservaciones recurrentes.</p>
      )}

      {/* Formulario para agregar */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--fg)]">Día</span>
          <select
            value={form.dayOfWeek}
            onChange={(e) => setForm((p) => ({ ...p, dayOfWeek: Number(e.target.value) }))}
            className="rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          >
            {JS_DAY_LABELS.map((label, i) => (
              <option key={i} value={i}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--fg)]">Título (opcional)</span>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Ej. Reunión semanal"
            maxLength={100}
            className="rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--fg)]">Hora inicio</span>
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
            className="rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--fg)]">Hora fin</span>
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
            className="rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </label>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          className="inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Agregar reservación'}
        </button>
      </div>
    </section>
  );
}

type SettingsFormProps = {
  initialValues: UserSettingsValues;
};

function clampBufferMinutes(value: string, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  const rounded = Math.round(num);
  if (rounded === 0) return 0;
  return Math.round(rounded / 5) * 5;
}

const DEFAULT_CATEGORIES = ['Trabajo', 'Escuela', 'Personal'];

export default function SettingsForm({ initialValues }: SettingsFormProps) {
  const [form, setForm] = useState<UserSettingsValues>(initialValues);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const [reoptStatus, setReoptStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [reoptMessage, setReoptMessage] = useState<string | null>(null);

  // Categorias
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [newCategory, setNewCategory] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catMessage, setCatMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (Array.isArray(data?.categories) && data.categories.length > 0) {
          setCategories(data.categories);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSaveCategories() {
    setCatSaving(true);
    setCatMessage(null);
    try {
      const res = await fetch('/api/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || 'Error al guardar');
      }
      setCatMessage('Categorias guardadas.');
    } catch (e) {
      setCatMessage(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setCatSaving(false);
    }
  }

  function addCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed || categories.includes(trimmed) || categories.length >= 5) return;
    setCategories((prev) => [...prev, trimmed]);
    setNewCategory('');
  }

  function removeCategory(idx: number) {
    if (categories.length <= 2) return;
    setCategories((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveCategoryUp(idx: number) {
    if (idx === 0) return;
    setCategories((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function moveCategoryDown(idx: number) {
    setCategories((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

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
    <div className="space-y-8">
      {/* ── Nota informativa ── */}
      <div className="rounded-2xl border border-slate-200/60 bg-slate-50 px-4 py-3">
        <p className="text-sm text-[var(--muted)]">
          Los cambios en la configuración se aplican a partir del siguiente evento que se agende.
          Los eventos ya existentes conservan la configuración con la que fueron creados.
          Esto puede causar pequeñas inconsistencias si modificas preferencias con eventos activos.
        </p>
      </div>

      {/* ── Categorías ── */}
      <section className="space-y-3 rounded-3xl border border-slate-200/70 bg-[var(--surface)]/80 p-6 shadow-sm">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--fg)]">Categorias</h2>
          <p className="text-sm text-[var(--muted)]">
            Administra las categorías disponibles al crear eventos. El orden define la prioridad que el solver usará para desempatar.
          </p>
        </header>
        <div className="space-y-2">
          {categories.map((cat, idx) => (
            <div key={cat} className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 text-sm">
              <span className="flex-1 font-medium text-[var(--fg)]">{cat}</span>
              <span className="text-xs text-[var(--muted)]">#{idx + 1}</span>
              <button type="button" onClick={() => moveCategoryUp(idx)} disabled={idx === 0}
                className="rounded px-1.5 py-0.5 text-xs text-[var(--muted)] disabled:opacity-30 hover:bg-slate-100">
                ↑
              </button>
              <button type="button" onClick={() => moveCategoryDown(idx)} disabled={idx === categories.length - 1}
                className="rounded px-1.5 py-0.5 text-xs text-[var(--muted)] disabled:opacity-30 hover:bg-slate-100">
                ↓
              </button>
              <button type="button" onClick={() => removeCategory(idx)} disabled={categories.length <= 2}
                className="rounded px-1.5 py-0.5 text-xs text-rose-500 disabled:opacity-30 hover:bg-rose-50">
                Eliminar
              </button>
            </div>
          ))}
        </div>
        {categories.length < 5 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
              placeholder="Nueva categoria"
              maxLength={40}
              className="flex-1 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
            <button type="button" onClick={addCategory} disabled={!newCategory.trim()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-slate-800">
              Agregar
            </button>
          </div>
        )}
        {catMessage && (
          <p className={`text-sm ${catMessage.startsWith('Error') ? 'text-rose-600' : 'text-emerald-700'}`}>
            {catMessage}
          </p>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={handleSaveCategories} disabled={catSaving}
            className="inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60">
            {catSaving ? 'Guardando…' : 'Guardar categorias'}
          </button>
        </div>
      </section>

    <RecurringReservationsSection />

    <form
      onSubmit={handleSubmit}
      className="space-y-8 rounded-3xl border border-slate-200/70 bg-[var(--surface)]/80 p-6 shadow-sm"
    >
      {/* Dias y horarios habilitados */}
      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--fg)]">Dias y horarios habilitados</h2>
          <p className="text-sm text-[var(--muted)]">
            Define el horario y los dias que el sistema usara para agendar eventos automaticamente
            y para mostrar el calendario.
          </p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--fg)]">Inicio del dia</span>
            <input
              type="time"
              value={form.dayStart}
              onChange={(e) => setForm((prev) => ({ ...prev, dayStart: e.target.value || prev.dayStart }))}
              className="rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-[var(--fg)] shadow-inner focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--fg)]">Fin del dia</span>
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
        <p className="text-sm font-medium text-[var(--fg)]">Dias activos</p>
        <div className="grid gap-2">
          {DAY_CODES.map((code) => {
            const isEnabled = enabledSet.has(code);

            return (
              <div
                key={code}
                className="rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2 shadow-sm transition hover:border-slate-300"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400"
                    checked={isEnabled}
                    onChange={() => toggleDay(code)}
                  />
                  <span className="text-sm font-medium text-[var(--fg)]">{DAY_LABELS[code]}</span>
                  {isEnabled && (
                    <span className="ml-auto text-xs text-[var(--muted)]">
                      {form.dayStart} - {form.dayEnd}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
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
              step={5}
              value={form.schedulingLeadMinutes}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  schedulingLeadMinutes: clampBufferMinutes(e.target.value, prev.schedulingLeadMinutes),
                }))
              }
              className="rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-[var(--fg)] shadow-inner focus:border-indigo-400 focus:outline-none"
            />
            <span className="text-xs text-[var(--muted)]">Debe ser 0 o múltiplo de 5</span>
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
    </div>
  );
}
