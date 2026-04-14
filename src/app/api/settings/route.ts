import { NextResponse } from 'next/server';

import { type Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import {
  DEFAULT_USER_SETTINGS,
  mergeUserSettings,
  parseEnabledDaysField,
  sanitizeBufferMinutes,
  sanitizeDayCodes,
  sanitizeTimeString,
  sanitizeTimezone,
  serializeEnabledDays,
  sanitizeAvailabilitySlots,
  type AvailabilitySlotInput,
  type DayCode,
  type UserSettingsValues,
} from '@/lib/user-settings';

function formatSettings(record?: {
  dayStart: string;
  dayEnd: string;
  enabledDays: string;
  eventBufferMinutes: number;
  schedulingLeadMinutes: number;
  timezone: string;
} | null): UserSettingsValues {
  if (!record) {
    return { ...DEFAULT_USER_SETTINGS };
  }

  return {
    dayStart: sanitizeTimeString(record.dayStart, DEFAULT_USER_SETTINGS.dayStart),
    dayEnd: sanitizeTimeString(record.dayEnd, DEFAULT_USER_SETTINGS.dayEnd),
    enabledDays: parseEnabledDaysField(record.enabledDays),
    eventBufferMinutes: sanitizeBufferMinutes(
      record.eventBufferMinutes,
      DEFAULT_USER_SETTINGS.eventBufferMinutes,
    ),
    schedulingLeadMinutes: sanitizeBufferMinutes(
      record.schedulingLeadMinutes,
      DEFAULT_USER_SETTINGS.schedulingLeadMinutes,
    ),
    timezone: sanitizeTimezone(record.timezone, DEFAULT_USER_SETTINGS.timezone),
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const [record, slots] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
    prisma.availabilitySlot.findMany({ where: { userId: user.id } }),
  ]);
  const settings = formatSettings(record ?? undefined);
  const availabilitySlots: AvailabilitySlotInput[] = slots.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
  }));
  return NextResponse.json({ ...settings, availabilitySlots });
}

type IncomingSettings = {
  dayStart?: string;
  dayEnd?: string;
  enabledDays?: DayCode[];
  eventBufferMinutes?: number;
  schedulingLeadMinutes?: number;
  timezone?: string;
  availabilitySlots?: AvailabilitySlotInput[];
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
      ? sanitizeBufferMinutes(body.eventBufferMinutes, base.eventBufferMinutes)
      : base.eventBufferMinutes;
  const schedulingLeadMinutes =
    body.schedulingLeadMinutes !== undefined
      ? sanitizeBufferMinutes(body.schedulingLeadMinutes, base.schedulingLeadMinutes)
      : base.schedulingLeadMinutes;
  const timezone =
    body.timezone !== undefined
      ? sanitizeTimezone(body.timezone, base.timezone)
      : base.timezone;

  const updatePayload = {
    dayStart,
    dayEnd,
    enabledDays: serializeEnabledDays(enabledDays),
    eventBufferMinutes,
    schedulingLeadMinutes,
    timezone,
  };

  const sanitizedSlots = body.availabilitySlots !== undefined
    ? sanitizeAvailabilitySlots(body.availabilitySlots, enabledDays)
    : null;

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.userSettings.upsert({
      where: { userId: user.id },
      update: updatePayload,
      create: { userId: user.id, ...updatePayload },
    }),
  ];

  if (sanitizedSlots !== null) {
    operations.unshift(prisma.availabilitySlot.deleteMany({ where: { userId: user.id } }));
    if (sanitizedSlots.length > 0) {
      operations.push(
        prisma.availabilitySlot.createMany({
          data: sanitizedSlots.map((s) => ({
            userId: user.id,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
          })),
        }),
      );
    }
  }

  await prisma.$transaction(operations);

  const [record, savedSlots] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
    prisma.availabilitySlot.findMany({ where: { userId: user.id } }),
  ]);

  const merged = mergeUserSettings({
    dayStart: record!.dayStart,
    dayEnd: record!.dayEnd,
    enabledDays: parseEnabledDaysField(record!.enabledDays),
    eventBufferMinutes: record!.eventBufferMinutes,
    schedulingLeadMinutes: record!.schedulingLeadMinutes,
    timezone: record!.timezone,
  });

  const availabilitySlots: AvailabilitySlotInput[] = savedSlots.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
  }));

  return NextResponse.json({ ...merged, availabilitySlots });
}
