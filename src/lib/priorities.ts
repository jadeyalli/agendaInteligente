export type Priority = 'CRITICA' | 'URGENTE' | 'RELEVANTE' | 'OPCIONAL';

export const PRIORITIES: Priority[] = ['CRITICA', 'URGENTE', 'RELEVANTE', 'OPCIONAL'];

export const PRIORITY_STYLES: Record<Priority, { bg: string; color: string }> = {
  CRITICA: { bg: 'var(--critica)', color: '#fff' },
  URGENTE: { bg: 'var(--urgente)', color: '#111827' },
  RELEVANTE: { bg: 'var(--relevante)', color: '#fff' },
  OPCIONAL: { bg: 'var(--opcional)', color: '#111827' },
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  CRITICA: 'Crítica',
  URGENTE: 'Urgente',
  RELEVANTE: 'Relevante',
  OPCIONAL: 'Opcional',
};

export function getPriorityStyle(priority: Priority) {
  return PRIORITY_STYLES[priority];
}
