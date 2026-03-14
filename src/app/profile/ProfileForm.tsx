'use client';

import { useState } from 'react';

type Props = { initialName: string | null; initialEmail: string };

export default function ProfileForm({ initialName, initialEmail }: Props) {
  const [name, setName] = useState(initialName ?? '');
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined, email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al guardar.'); return; }
      setSuccess(true);
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="block text-sm font-medium text-[var(--fg)]" htmlFor="profile-name">
          Nombre
        </label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm text-[var(--fg)] placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-[var(--fg)]" htmlFor="profile-email">
          Correo electrónico
        </label>
        <input
          id="profile-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm text-[var(--fg)] placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>
      {error && <p className="text-sm text-rose-500">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Cambios guardados correctamente.</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </form>
  );
}
