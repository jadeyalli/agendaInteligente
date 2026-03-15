'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Tag } from 'lucide-react';

export default function CategoriesForm() {
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.categories) setCategories(data.categories);
      })
      .catch(() => {});
  }, []);

  function addCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setError('Esa categoría ya existe.');
      return;
    }
    setCategories((prev) => [...prev, trimmed]);
    setNewCategory('');
    setError(null);
    inputRef.current?.focus();
  }

  function removeCategory(index: number) {
    setCategories((prev) => prev.filter((_, i) => i !== index));
    setMessage(null);
    setError(null);
  }

  async function handleSave() {
    if (categories.length === 0) {
      setError('Debe haber al menos una categoría.');
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo guardar');
      }
      setMessage('Categorías guardadas correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Chips de categorías existentes */}
      <div className="flex flex-wrap gap-2 min-h-[40px]">
        {categories.length === 0 && (
          <p className="text-sm text-[var(--muted)]">Sin categorías. Agrega al menos una.</p>
        )}
        {categories.map((cat, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/80 px-3 py-1 text-sm font-medium text-[var(--fg)] shadow-sm"
          >
            <Tag className="h-3 w-3 text-indigo-400 shrink-0" />
            {cat}
            <button
              type="button"
              onClick={() => removeCategory(i)}
              className="ml-0.5 rounded-full p-0.5 text-[var(--muted)] transition hover:bg-rose-50 hover:text-rose-500"
              aria-label={`Eliminar categoría ${cat}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Agregar nueva */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={newCategory}
          onChange={(e) => { setNewCategory(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          placeholder="Nueva categoría…"
          maxLength={40}
          className="flex-1 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-[var(--fg)] shadow-inner focus:border-indigo-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={addCategory}
          disabled={!newCategory.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm font-medium text-[var(--fg)] shadow-sm transition hover:border-slate-300 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          Agregar
        </button>
      </div>

      {(message || error) && (
        <p className={`text-sm ${message ? 'text-emerald-600' : 'text-rose-600'}`}>
          {message ?? error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || categories.length === 0}
          className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar categorías'}
        </button>
      </div>
    </div>
  );
}
