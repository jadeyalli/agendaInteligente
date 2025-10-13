// src/theme/themes.ts
export type ThemeKey = 'pastel' | 'funny' | 'cool' | 'autumn' | 'mono';
type Labels = { CRITICA: string; URGENTE: string; RELEVANTE: string; OPCIONAL: string };
type LabelsFg = { CRITICA: string; URGENTE: string; RELEVANTE: string; OPCIONAL: string };
type Neutrals = { bg: string; surface: string; text: string; muted: string };

export const THEMES: Record<ThemeKey, { labels: Labels; labelsFg: LabelsFg; neutrals: Neutrals }> = {
  pastel: {
    labels:   { CRITICA:'#bfefa2', URGENTE:'#f4d283', RELEVANTE:'#ffb294', OPCIONAL:'#ff9fc2' },
    labelsFg: { CRITICA:'#0f172a', URGENTE:'#0f172a', RELEVANTE:'#0f172a', OPCIONAL:'#0f172a' },
    neutrals: { bg:'#f7f7f9', surface:'#ffffff', text:'#0f172a', muted:'#64748b' },
  },
  funny: {
    labels:   { CRITICA:'#b7ed4c', URGENTE:'#00aeff', RELEVANTE:'#8062f1', OPCIONAL:'#d14ced' },
    labelsFg: { CRITICA:'#0f172a', URGENTE:'#ffffff', RELEVANTE:'#ffffff', OPCIONAL:'#ffffff' },
    neutrals: { bg:'#f8fafc', surface:'#ffffff', text:'#0f172a', muted:'#64748b' },
  },
  cool: {
    labels:   { CRITICA:'#001F36', URGENTE:'#1C5560', RELEVANTE:'#79AE92', OPCIONAL:'#FBFFCD' },
    labelsFg: { CRITICA:'#ffffff', URGENTE:'#ffffff', RELEVANTE:'#0f172a', OPCIONAL:'#0f172a' },
    neutrals: { bg:'#0f1115', surface:'#171a1f', text:'#e5e7eb', muted:'#94a3b8' },
  },
  autumn: {
    labels:   { CRITICA:'#d46419', URGENTE:'#b34212', RELEVANTE:'#341405', OPCIONAL:'#166665' },
    labelsFg: { CRITICA:'#ffffff', URGENTE:'#ffffff', RELEVANTE:'#ffffff', OPCIONAL:'#ffffff' },
    neutrals: { bg:'#f5f5f4', surface:'#ffffff', text:'#0f172a', muted:'#6b7280' },
  },
  mono: {
    labels:   { CRITICA:'#1d1d1d', URGENTE:'#393939', RELEVANTE:'#565656', OPCIONAL:'#727272' },
    labelsFg: { CRITICA:'#ffffff', URGENTE:'#ffffff', RELEVANTE:'#ffffff', OPCIONAL:'#ffffff' },
    neutrals: { bg:'#121212', surface:'#1e1e1e', text:'#e5e5e5', muted:'#a3a3a3' },
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

  r.setProperty('--prio-critica-fg', t.labelsFg.CRITICA);
  r.setProperty('--prio-urgente-fg', t.labelsFg.URGENTE);
  r.setProperty('--prio-relevante-fg', t.labelsFg.RELEVANTE);
  r.setProperty('--prio-opcional-fg', t.labelsFg.OPCIONAL);

  window.dispatchEvent(new CustomEvent('ai-theme-change', { detail: { theme: key } }));
}
