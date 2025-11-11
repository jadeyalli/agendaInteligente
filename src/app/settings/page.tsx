import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import {
  DEFAULT_USER_SETTINGS,
  mergeUserSettings,
  parseEnabledDaysField,
  type UserSettingsValues,
} from '@/lib/user-settings';

import SettingsForm from './SettingsForm';

async function loadUserSettings(userId: string): Promise<UserSettingsValues> {
  const record = await prisma.userSettings.findUnique({ where: { userId } });
  if (!record) {
    return { ...DEFAULT_USER_SETTINGS };
  }
  return mergeUserSettings({
    dayStart: record.dayStart,
    dayEnd: record.dayEnd,
    enabledDays: parseEnabledDaysField(record.enabledDays),
    eventBufferMinutes: record.eventBufferMinutes,
    schedulingLeadMinutes: record.schedulingLeadMinutes,
  });
}

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }

  const settings = await loadUserSettings(user.id);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-12 sm:py-16">
        <div className="space-y-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-indigo-500 transition hover:text-indigo-600"
          >
            ← Volver al panel
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--fg)] sm:text-3xl">Configuración personal</h1>
          <p className="max-w-2xl text-sm text-[var(--muted)]">
            Personaliza los horarios y reglas que la Agenda Inteligente utilizará para mostrar tu
            calendario y sugerir nuevos eventos.
          </p>
        </div>

        <SettingsForm initialValues={settings} />
      </main>
    </div>
  );
}
