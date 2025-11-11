import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import {
  DEFAULT_USER_SETTINGS,
  mergeUserSettings,
  parseEnabledDaysField,
  sanitizeDayCodes,
  sanitizePositiveInteger,
  sanitizeTimeString,
  serializeEnabledDays,
  type DayCode,
  type UserSettingsValues,
} from '@/lib/user-settings';

function formatSettings(record?: {
  dayStart: string;
  dayEnd: string;
  enabledDays: string;
  eventBufferMinutes: number;
  schedulingLeadMinutes: number;
} | null): UserSettingsValues {
  if (!record) {
    return { ...DEFAULT_USER_SETTINGS };
  }

  return {
    dayStart: sanitizeTimeString(record.dayStart, DEFAULT_USER_SETTINGS.dayStart),
    dayEnd: sanitizeTimeString(record.dayEnd, DEFAULT_USER_SETTINGS.dayEnd),
    enabledDays: parseEnabledDaysField(record.enabledDays),
    eventBufferMinutes: sanitizePositiveInteger(
      record.eventBufferMinutes,
      DEFAULT_USER_SETTINGS.eventBufferMinutes,
    ),
    schedulingLeadMinutes: sanitizePositiveInteger(
      record.schedulingLeadMinutes,
      DEFAULT_USER_SETTINGS.schedulingLeadMinutes,
    ),
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const record = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  const settings = formatSettings(record ?? undefined);
  return NextResponse.json(settings);
}

type IncomingSettings = {
  dayStart?: string;
  dayEnd?: string;
  enabledDays?: DayCode[];
  eventBufferMinutes?: number;
  schedulingLeadMinutes?: number;
};

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as IncomingSettings;

  const existing = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  const base = formatSettings(existing ?? undefined);

  const dayStart =
    body.dayStart !== undefined
      ? sanitizeTimeString(body.dayStart, base.dayStart)
      : base.dayStart;
  const dayEnd =
    body.dayEnd !== undefined ? sanitizeTimeString(body.dayEnd, base.dayEnd) : base.dayEnd;
  const enabledDays =
    body.enabledDays !== undefined
      ? sanitizeDayCodes(body.enabledDays, base.enabledDays)
      : base.enabledDays;
  const eventBufferMinutes =
    body.eventBufferMinutes !== undefined
      ? sanitizePositiveInteger(body.eventBufferMinutes, base.eventBufferMinutes)
      : base.eventBufferMinutes;
  const schedulingLeadMinutes =
    body.schedulingLeadMinutes !== undefined
      ? sanitizePositiveInteger(body.schedulingLeadMinutes, base.schedulingLeadMinutes)
      : base.schedulingLeadMinutes;

  const updatePayload = {
    dayStart,
    dayEnd,
    enabledDays: serializeEnabledDays(enabledDays),
    eventBufferMinutes,
    schedulingLeadMinutes,
  };

  const record = await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: updatePayload,
    create: { userId: user.id, ...updatePayload },
  });

  const merged = mergeUserSettings({
    dayStart: record.dayStart,
    dayEnd: record.dayEnd,
    enabledDays: parseEnabledDaysField(record.enabledDays),
    eventBufferMinutes: record.eventBufferMinutes,
    schedulingLeadMinutes: record.schedulingLeadMinutes,
  });

  return NextResponse.json(merged);
}
