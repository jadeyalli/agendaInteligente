export function isValidDateInput(value?: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export function isValidTimeInput(value?: string | null): value is string {
  return !!value && /^\d{2}:\d{2}$/.test(value.trim());
}

export function dateAndTimeToDateLocal(date?: string | null, time?: string | null): Date | null {
  if (!isValidDateInput(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  let hours = 0;
  let minutes = 0;
  if (isValidTimeInput(time)) {
    const [h, m] = time!.split(':').map(Number);
    hours = Number.isFinite(h) ? h : 0;
    minutes = Number.isFinite(m) ? m : 0;
  }
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function dateStringToStartOfDay(date?: string | null): Date | null {
  if (!isValidDateInput(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function dateStringToEndOfDay(date?: string | null): Date | null {
  if (!isValidDateInput(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}
