'use client';

import React, { useRef, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onImported?: (count: number) => void;
};

export default function IcsImportModal({ open, onClose, onImported }: Props) {
  const [mode, setMode] = useState<'REMINDER' | 'SMART'>('REMINDER');
  const [calendarName, setCalendarName] = useState('Personal');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    if (!loading) onClose();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setErr('Selecciona un archivo .ics');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', mode);
    fd.append('calendarName', calendarName);

    try {
      setLoading(true);
      const res = await fetch('/api/import-ics', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo importar');
      onImported?.(json.count ?? 0);
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Error al importar');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Importar archivo .ICS
          </h3>
          <button
            className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
            onClick={close}
            disabled={loading}
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Archivo */}
          <div>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Archivo (.ics)
            </label>
            <input
              ref={inputRef}
              type="file"
              accept=".ics"
              className={[
                'mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm',
                'text-slate-900 placeholder:text-slate-500',
                'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30',
                'file:mr-4 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-slate-700',
                'hover:file:bg-slate-50',
                'dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:border-slate-700',
                'dark:file:bg-slate-800 dark:file:border-slate-700 dark:file:text-slate-200 dark:hover:file:bg-slate-700',
              ].join(' ')}
              disabled={loading}
            />
          </div>

          {/* Modo */}
          <div>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Modo de importación
            </label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 p-3 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60">
                <input
                  type="radio"
                  name="mode"
                  value="REMINDER"
                  checked={mode === 'REMINDER'}
                  onChange={() => setMode('REMINDER')}
                  disabled={loading}
                  className="mt-1 h-4 w-4 accent-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Importar como recordatorios
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Crea avisos de día completo que no usan el motor inteligente.
                  </div>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 p-3 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60">
                <input
                  type="radio"
                  name="mode"
                  value="SMART"
                  checked={mode === 'SMART'}
                  onChange={() => setMode('SMART')}
                  disabled={loading}
                  className="mt-1 h-4 w-4 accent-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Posicionamiento inteligente
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Crea eventos relevantes que respetan la recurrencia del calendario.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Calendario destino */}
          <div>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Calendario destino
            </label>
            <input
              type="text"
              value={calendarName}
              onChange={(e) => setCalendarName(e.target.value)}
              className={[
                'mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm',
                'text-slate-900 placeholder:text-slate-500',
                'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30',
                'dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:border-slate-700',
              ].join(' ')}
              disabled={loading}
              placeholder="Personal"
            />
          </div>

          {err ? (
            <p className="text-sm font-medium text-red-600">{err}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={close}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Importando…' : 'Importar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
