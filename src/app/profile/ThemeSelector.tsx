'use client';

import { useState } from 'react';
import { type ThemeKey, THEMES, applyTheme, currentTheme } from '@/theme/themes';

const THEME_LABELS: Record<ThemeKey, string> = {
  pastel: 'Pastel',
  funny: 'Divertido',
  cool: 'Frío',
  autumn: 'Otoño',
  mono: 'Monocromático',
};

export default function ThemeSelector() {
  const [active, setActive] = useState<ThemeKey>(currentTheme());

  function select(key: ThemeKey) {
    applyTheme(key);
    setActive(key);
  }

  return (
    <div className="flex flex-wrap gap-3">
      {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
        const t = THEMES[key];
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => select(key)}
            className={[
              'flex flex-col items-center gap-2 rounded-2xl border p-3 transition hover:-translate-y-0.5',
              isActive
                ? 'border-indigo-400 shadow-md ring-2 ring-indigo-200'
                : 'border-slate-200/70 hover:border-slate-300',
            ].join(' ')}
            title={THEME_LABELS[key]}
          >
            <div className="flex gap-1">
              {(['CRITICA', 'URGENTE', 'RELEVANTE', 'OPCIONAL'] as const).map((p) => (
                <span
                  key={p}
                  className="h-5 w-5 rounded-full"
                  style={{ backgroundColor: t.labels[p] }}
                />
              ))}
            </div>
            <span
              className="text-xs font-medium"
              style={{ color: t.neutrals.text, backgroundColor: t.neutrals.bg, borderRadius: '0.5rem', padding: '0 6px' }}
            >
              {THEME_LABELS[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
