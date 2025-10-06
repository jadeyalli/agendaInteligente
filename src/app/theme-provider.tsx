'use client';
import { useEffect } from 'react';

type ThemeStrict = {
  colorCritica: string;
  colorUrgente: string;
  colorRelevante: string;
  colorOpcional: string;
};

const DEFAULT_THEME: ThemeStrict = {
  colorCritica: '#EF4444',   // rojo
  colorUrgente: '#F59E0B',   // ámbar
  colorRelevante: '#10B981', // verde (accent)
  colorOpcional: '#9CA3AF',  // gris
};

type Props = {
  // ✅ permitir parciales; rellenamos adentro con defaults
  prefs?: Partial<ThemeStrict>;
  children: React.ReactNode;
};

export default function ThemeProvider({ prefs, children }: Props) {
  // Mezcla de prefs del usuario con defaults
  const theme: ThemeStrict = {
    colorCritica: prefs?.colorCritica ?? DEFAULT_THEME.colorCritica,
    colorUrgente: prefs?.colorUrgente ?? DEFAULT_THEME.colorUrgente,
    colorRelevante: prefs?.colorRelevante ?? DEFAULT_THEME.colorRelevante,
    colorOpcional: prefs?.colorOpcional ?? DEFAULT_THEME.colorOpcional,
  };

  useEffect(() => {
    const root = document.documentElement;
    // Colores por etiqueta
    root.style.setProperty('--critica', theme.colorCritica);
    root.style.setProperty('--urgente', theme.colorUrgente);
    root.style.setProperty('--relevante', theme.colorRelevante);
    root.style.setProperty('--opcional', theme.colorOpcional);

    // Puedes usar el relevante como accent por defecto
    root.style.setProperty('--accent', theme.colorRelevante);

    // Otros tokens base
    root.style.setProperty('--surface', '#FFFFFF');
    root.style.setProperty('--border', '#E5E7EB');
    root.style.setProperty('--bg', '#F9FAFB');
    root.style.setProperty('--text', '#111827');
  }, [theme.colorCritica, theme.colorUrgente, theme.colorRelevante, theme.colorOpcional]);

  return <>{children}</>;
}
