// src/theme/themes.ts
export type ThemeKey = 'pastel' | 'funny' | 'cool' | 'autumn' | 'mono';
type Labels = { CRITICA: string; URGENTE: string; RELEVANTE: string; OPCIONAL: string; RECORDATORIO: string };
type LabelsFg = { CRITICA: string; URGENTE: string; RELEVANTE: string; OPCIONAL: string; RECORDATORIO: string };
type Neutrals = { bg: string; surface: string; text: string; muted: string };

export const THEMES: Record<ThemeKey, { labels: Labels; labelsFg: LabelsFg; neutrals: Neutrals }> = {
  pastel: {
    labels: {
      CRITICA: '#dc2626',
      URGENTE: '#ea580c',
      RELEVANTE: '#2563eb',
      OPCIONAL: '#0d9488',
      RECORDATORIO: '#7c3aed',
    },
    labelsFg: {
      CRITICA: '#ffffff',
      URGENTE: '#ffffff',
      RELEVANTE: '#ffffff',
      OPCIONAL: '#ffffff',
      RECORDATORIO: '#fdf4ff',
    },
    neutrals: { bg: '#f8fafc', surface: '#ffffff', text: '#0f172a', muted: '#475569' },
  },
  funny: {
    labels: {
      CRITICA: '#7c3aed',
      URGENTE: '#d946ef',
      RELEVANTE: '#059669',
      OPCIONAL: '#0ea5e9',
      RECORDATORIO: '#facc15',
    },
    labelsFg: {
      CRITICA: '#ffffff',
      URGENTE: '#ffffff',
      RELEVANTE: '#ffffff',
      OPCIONAL: '#0f172a',
      RECORDATORIO: '#0f172a',
    },
    neutrals: { bg: '#fefce8', surface: '#ffffff', text: '#1e293b', muted: '#64748b' },
  },
  cool: {
    labels: {
      CRITICA: '#0ea5e9',
      URGENTE: '#22d3ee',
      RELEVANTE: '#10b981',
      OPCIONAL: '#a3e635',
      RECORDATORIO: '#a855f7',
    },
    labelsFg: {
      CRITICA: '#0f172a',
      URGENTE: '#0f172a',
      RELEVANTE: '#053220',
      OPCIONAL: '#0f172a',
      RECORDATORIO: '#0f172a',
    },
    neutrals: { bg: '#0f172a', surface: '#111827', text: '#e2e8f0', muted: '#94a3b8' },
  },
  autumn: {
    labels: {
      CRITICA: '#b45309',
      URGENTE: '#92400e',
      RELEVANTE: '#78350f',
      OPCIONAL: '#166534',
      RECORDATORIO: '#9d174d',
    },
    labelsFg: {
      CRITICA: '#fefce8',
      URGENTE: '#fef3c7',
      RELEVANTE: '#fde68a',
      OPCIONAL: '#ecfdf5',
      RECORDATORIO: '#fdf2f8',
    },
    neutrals: { bg: '#fffbeb', surface: '#fef3c7', text: '#422006', muted: '#854d0e' },
  },
  mono: {
    labels: {
      CRITICA: '#1f2937',
      URGENTE: '#334155',
      RELEVANTE: '#475569',
      OPCIONAL: '#64748b',
      RECORDATORIO: '#94a3b8',
    },
    labelsFg: {
      CRITICA: '#f8fafc',
      URGENTE: '#f1f5f9',
      RELEVANTE: '#f1f5f9',
      OPCIONAL: '#f8fafc',
      RECORDATORIO: '#0f172a',
    },
    neutrals: { bg: '#0f172a', surface: '#111827', text: '#e2e8f0', muted: '#94a3b8' },
  },
};

export function currentTheme(): ThemeKey {
  if (typeof window === 'undefined') return 'pastel';
  const t = (localStorage.getItem('ai-theme') as ThemeKey) || 'pastel';
  return (Object.keys(THEMES) as ThemeKey[]).includes(t) ? t : 'pastel';
}

export function applyTheme(key: ThemeKey) {
  if (typeof document === 'undefined') return;
  const t = THEMES[key];
  localStorage.setItem('ai-theme', key);
  document.documentElement.setAttribute('data-theme', key);

  const r = document.documentElement.style;
  // neutrales
  r.setProperty('--bg', t.neutrals.bg);
  r.setProperty('--surface', t.neutrals.surface);
  r.setProperty('--fg', t.neutrals.text);
  r.setProperty('--muted', t.neutrals.muted);
  // etiquetas
  r.setProperty('--prio-critica', t.labels.CRITICA);
  r.setProperty('--prio-urgente', t.labels.URGENTE);
  r.setProperty('--prio-relevante', t.labels.RELEVANTE);
  r.setProperty('--prio-opcional', t.labels.OPCIONAL);
  r.setProperty('--prio-recordatorio', t.labels.RECORDATORIO);

  r.setProperty('--prio-critica-fg', t.labelsFg.CRITICA);
  r.setProperty('--prio-urgente-fg', t.labelsFg.URGENTE);
  r.setProperty('--prio-relevante-fg', t.labelsFg.RELEVANTE);
  r.setProperty('--prio-opcional-fg', t.labelsFg.OPCIONAL);
  r.setProperty('--prio-recordatorio-fg', t.labelsFg.RECORDATORIO);

  window.dispatchEvent(new CustomEvent('ai-theme-change', { detail: { theme: key } }));
}
