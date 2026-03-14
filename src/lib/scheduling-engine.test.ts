import { describe, it, expect } from 'vitest';
import type { Event } from '@prisma/client';

import {
  buildSchedulingContext,
  ensurePositiveDurationMs,
  isUnsetDate,
  schedulingWindowOf,
  type SchedulingPreferences,
} from './scheduling-engine';

// ─── helpers ───────────────────────────────────────────────────────────────

function makePrefs(overrides: Partial<SchedulingPreferences> = {}): SchedulingPreferences {
  return {
    startHour: 9,
    startMinute: 0,
    endHour: 18,
    endMinute: 0,
    bufferMinutes: 0,
    leadMinutes: 0,
    enabledWeekdays: new Set([0, 1, 2, 3, 4]), // Mon-Fri
    perDaySlots: new Map(),
    ...overrides,
  };
}

function makeContext(overrides: Partial<SchedulingPreferences> = {}) {
  return buildSchedulingContext(makePrefs(overrides));
}

/** Build a minimal Event stub for schedulingWindowOf */
function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'test-id',
    userId: 'user-1',
    calendarId: null,
    kind: 'EVENTO',
    title: 'Test',
    description: null,
    category: null,
    priority: 'URGENTE' as Event['priority'],
    status: 'SCHEDULED',
    repeat: 'NONE' as Event['repeat'],
    rrule: null,
    originEventId: null,
    start: null,
    end: null,
    durationMinutes: 60,
    isAllDay: false,
    isFixed: false,
    isInPerson: true,
    canOverlap: false,
    participatesInScheduling: true,
    window: 'NONE' as Event['window'],
    windowStart: null,
    windowEnd: null,
    dueDate: null,
    todoStatus: null,
    completed: false,
    percentComplete: 0,
    completedAt: null,
    transparency: null,
    tzid: 'UTC',
    rruleUntil: null,
    lastModified: null,
    createdIcal: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as unknown as Event;
}

// ─── isUnsetDate ───────────────────────────────────────────────────────────

describe('isUnsetDate', () => {
  it('returns true for null', () => {
    expect(isUnsetDate(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isUnsetDate(undefined)).toBe(true);
  });

  it('returns true for epoch 0', () => {
    expect(isUnsetDate(new Date(0))).toBe(true);
  });

  it('returns false for a real date', () => {
    expect(isUnsetDate(new Date('2024-06-15T10:00:00Z'))).toBe(false);
  });
});

// ─── ensurePositiveDurationMs ──────────────────────────────────────────────

describe('ensurePositiveDurationMs', () => {
  it('returns diff between start and end when positive', () => {
    const start = new Date('2024-06-15T09:00:00Z');
    const end = new Date('2024-06-15T10:30:00Z');
    const event = makeEvent({ start, end });
    expect(ensurePositiveDurationMs(event)).toBe(90 * 60 * 1000);
  });

  it('falls back to durationMinutes when start/end are null', () => {
    const event = makeEvent({ durationMinutes: 45 });
    expect(ensurePositiveDurationMs(event)).toBe(45 * 60 * 1000);
  });

  it('uses default 60 min when no duration info', () => {
    const event = makeEvent({ durationMinutes: null, start: null, end: null });
    expect(ensurePositiveDurationMs(event)).toBe(60 * 60 * 1000);
  });

  it('falls back to durationMinutes when start equals end (zero diff)', () => {
    const t = new Date('2024-06-15T09:00:00Z');
    const event = makeEvent({ start: t, end: t, durationMinutes: 30 });
    expect(ensurePositiveDurationMs(event)).toBe(30 * 60 * 1000);
  });
});

// ─── buildSchedulingContext ────────────────────────────────────────────────

describe('buildSchedulingContext', () => {
  it('includes all prefs fields', () => {
    const prefs = makePrefs({ bufferMinutes: 15 });
    const ctx = buildSchedulingContext(prefs);
    expect(ctx.bufferMinutes).toBe(15);
    expect(ctx.startHour).toBe(9);
    expect(ctx.endHour).toBe(18);
  });

  it('earliestStart is at least now + leadMinutes', () => {
    const before = Date.now();
    const ctx = makeContext({ leadMinutes: 60 });
    const after = Date.now();
    const earliest = ctx.earliestStart.getTime();
    expect(earliest).toBeGreaterThanOrEqual(before + 60 * 60_000);
    expect(earliest).toBeLessThanOrEqual(after + 60 * 60_000 + 100);
  });

  it('earliestStart is now when leadMinutes is 0', () => {
    const before = Date.now();
    const ctx = makeContext({ leadMinutes: 0 });
    expect(ctx.earliestStart.getTime()).toBeGreaterThanOrEqual(before);
  });
});

// ─── schedulingWindowOf ───────────────────────────────────────────────────

describe('schedulingWindowOf', () => {
  it('returns null when window PRONTO is fully in the past', () => {
    // leadMinutes = 0, but give a very long future as earliest so the window is before it
    const ctx = makeContext({ leadMinutes: 60 * 24 * 365 * 10 }); // 10 years lead
    const event = makeEvent({ window: 'PRONTO' as Event['window'] });
    // With 10 years lead, PRONTO (48h from now) is always before earliestStart
    const result = schedulingWindowOf(event, ctx);
    expect(result).toBeNull();
  });

  it('returns non-null for NONE window with default prefs', () => {
    const ctx = makeContext({ leadMinutes: 0 });
    const event = makeEvent({ window: 'NONE' as Event['window'] });
    const result = schedulingWindowOf(event, ctx);
    expect(result).not.toBeNull();
    expect(result!.end).toBeNull();
  });

  it('RANGO window respects windowStart and windowEnd', () => {
    const ctx = makeContext({ leadMinutes: 0 });
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days
    const futureEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // +14 days
    const event = makeEvent({
      window: 'RANGO' as Event['window'],
      windowStart: future,
      windowEnd: futureEnd,
    });
    const result = schedulingWindowOf(event, ctx);
    expect(result).not.toBeNull();
    expect(result!.end).not.toBeNull();
    // end should be <= futureEnd (may differ due to clamping)
    expect(result!.end!.getTime()).toBeLessThanOrEqual(futureEnd.getTime() + 1000);
  });

  it('SEMANA window has end within ~7 days from start', () => {
    const ctx = makeContext({ leadMinutes: 0 });
    const event = makeEvent({ window: 'SEMANA' as Event['window'] });
    const before = Date.now();
    const result = schedulingWindowOf(event, ctx);
    expect(result).not.toBeNull();
    expect(result!.end).not.toBeNull();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    expect(result!.end!.getTime()).toBeLessThanOrEqual(before + weekMs + 60_000);
  });
});
