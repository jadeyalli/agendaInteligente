'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

/* ──────────────────────────── tipos ──────────────────────────── */
export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  duration?: number; // ms, default 4000
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind, duration?: number) => void;
}

/* ──────────────────────────── contexto ──────────────────────── */
export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

/* ──────────────────────────── estilos ──────────────────────── */
const kindStyles: Record<ToastKind, { bar: string; icon: React.ReactNode; bg: string; border: string; text: string }> = {
  success: {
    bar: 'bg-emerald-500',
    bg: 'bg-white',
    border: 'border-emerald-200',
    text: 'text-slate-800',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />,
  },
  error: {
    bar: 'bg-rose-500',
    bg: 'bg-white',
    border: 'border-rose-200',
    text: 'text-slate-800',
    icon: <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />,
  },
  warning: {
    bar: 'bg-amber-400',
    bg: 'bg-white',
    border: 'border-amber-200',
    text: 'text-slate-800',
    icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />,
  },
  info: {
    bar: 'bg-blue-500',
    bg: 'bg-white',
    border: 'border-blue-200',
    text: 'text-slate-800',
    icon: <Info className="h-4 w-4 text-blue-500 shrink-0" />,
  },
};

/* ──────────────────────────── item individual ────────────────── */
function ToastItem({ t, onRemove }: { t: Toast; onRemove: (id: string) => void }) {
  const s = kindStyles[t.kind];
  const duration = t.duration ?? 4000;

  // barra de progreso
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.width = '100%';
    // forzar reflow
    void el.offsetWidth;
    el.style.transition = `width ${duration}ms linear`;
    el.style.width = '0%';
  }, [duration]);

  useEffect(() => {
    const timer = setTimeout(() => onRemove(t.id), duration);
    return () => clearTimeout(timer);
  }, [t.id, duration, onRemove]);

  return (
    <div
      className={`relative flex w-full max-w-sm overflow-hidden rounded-2xl border shadow-md ${s.bg} ${s.border}`}
      role="alert"
    >
      {/* barra de progreso inferior */}
      <div ref={barRef} className={`absolute bottom-0 left-0 h-[3px] ${s.bar}`} style={{ width: '100%' }} />

      <div className="flex flex-1 items-start gap-3 px-4 py-3">
        {s.icon}
        <p className={`flex-1 text-sm leading-snug ${s.text}`}>{t.message}</p>
        <button
          onClick={() => onRemove(t.id)}
          className="mt-0.5 shrink-0 rounded-full p-0.5 text-slate-400 hover:text-slate-600"
          aria-label="Cerrar notificación"
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────── provider ──────────────────────── */
let _counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'info', duration = 4000) => {
    const id = `toast-${++_counter}`;
    setToasts((prev) => [...prev, { id, kind, message, duration }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* portal de toasts — esquina inferior derecha */}
      <div className="fixed bottom-6 right-4 z-[9999] flex flex-col gap-2 sm:right-6" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
