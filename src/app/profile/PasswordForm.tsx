'use client';

import { useState } from 'react';

export default function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (next !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    if (next.length < 8) { setError('La nueva contraseña debe tener al menos 8 caracteres.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al cambiar la contraseña.'); return; }
      setSuccess(true);
      setCurrent(''); setNext(''); setConfirm('');
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm text-[var(--fg)] placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="block text-sm font-medium text-[var(--fg)]" htmlFor="pw-current">
          Contraseña actual
        </label>
        <input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required className={inputClass} />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-[var(--fg)]" htmlFor="pw-new">
          Nueva contraseña
        </label>
        <input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} required className={inputClass} />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-[var(--fg)]" htmlFor="pw-confirm">
          Confirmar nueva contraseña
        </label>
        <input id="pw-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={inputClass} />
      </div>
      {error && <p className="text-sm text-rose-500">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Contraseña actualizada correctamente.</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
