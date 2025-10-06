'use client';
import { useEffect } from 'react';

type Props = { prefs?: {
  colorCritica: string; colorUrgente: string; colorRelevante: string; colorOpcional: string;
}, children: React.ReactNode };

export default function ThemeProvider({ prefs, children }: Props) {
  useEffect(() => {
    const root = document.documentElement;
    // Colores por etiqueta
    root.style.setProperty('--critica', prefs?.colorCritica ?? '#EF4444');
    root.style.setProperty('--urgente', prefs?.colorUrgente ?? '#F59E0B');
    root.style.setProperty('--relevante', prefs?.colorRelevante ?? '#10B981');
    root.style.setProperty('--opcional', prefs?.colorOpcional ?? '#9CA3AF');
    // Esmeralda (accent)
    root.style.setProperty('--accent', '#10B981');
    root.style.setProperty('--surface', '#FFFFFF');
    root.style.setProperty('--border', '#E5E7EB');
    root.style.setProperty('--bg', '#F9FAFB');
    root.style.setProperty('--text', '#111827');
  }, [prefs]);

  return <>{children}</>;
}