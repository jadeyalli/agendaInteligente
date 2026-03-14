import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';

import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import {
  DEFAULT_USER_SETTINGS,
  mergeUserSettings,
  parseEnabledDaysField,
  type AvailabilitySlotInput,
  type UserSettingsValues,
} from '@/lib/user-settings';

import SettingsForm from '@/app/settings/SettingsForm';
import ProfileForm from './ProfileForm';
import PasswordForm from './PasswordForm';
import ThemeSelector from './ThemeSelector';

async function loadUserSettings(userId: string): Promise<{ settings: UserSettingsValues; slots: AvailabilitySlotInput[] }> {
  const [record, slotRecords] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.availabilitySlot.findMany({ where: { userId } }),
  ]);

  const settings = record
    ? mergeUserSettings({
        dayStart: record.dayStart,
        dayEnd: record.dayEnd,
        enabledDays: parseEnabledDaysField(record.enabledDays),
        eventBufferMinutes: record.eventBufferMinutes,
        schedulingLeadMinutes: record.schedulingLeadMinutes,
        timezone: record.timezone,
        weightStability: record.weightStability,
        weightUrgency: record.weightUrgency,
        weightWorkHours: record.weightWorkHours,
        weightCrossDay: record.weightCrossDay,
      })
    : { ...DEFAULT_USER_SETTINGS };

  const slots: AvailabilitySlotInput[] = slotRecords.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
  }));

  return { settings, slots };
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const [{ settings, slots }, params] = await Promise.all([
    loadUserSettings(user.id),
    searchParams,
  ]);
  const isFirstLogin = params.first === '1';

  const sectionClass = 'rounded-2xl border border-slate-200/70 bg-[var(--surface)]/90 p-6 shadow-sm space-y-4';
  const headingClass = 'text-base font-semibold text-[var(--fg)]';
  const subClass = 'text-sm text-[var(--muted)]';

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:py-14">

        {isFirstLogin && (
          <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-500">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-indigo-900">
                  ¡Bienvenido{user.name ? `, ${user.name.split(' ')[0]}` : ''}!
                </p>
                <p className="text-sm text-indigo-700">
                  Antes de empezar, configura tus horarios de trabajo y preferencias.
                  Cuando termines, haz clic en <strong>Guardar cambios</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-indigo-500 transition hover:text-indigo-600"
          >
            ← Volver al panel
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--fg)] sm:text-3xl">Perfil</h1>
        </div>

        {/* Cuenta */}
        <section className={sectionClass}>
          <div>
            <h2 className={headingClass}>Cuenta</h2>
            <p className={subClass}>Actualiza tu nombre y correo electrónico.</p>
          </div>
          <ProfileForm initialName={user.name ?? null} initialEmail={user.email} />
        </section>

        {/* Contraseña */}
        <section className={sectionClass}>
          <div>
            <h2 className={headingClass}>Contraseña</h2>
            <p className={subClass}>Elige una contraseña de al menos 8 caracteres.</p>
          </div>
          <PasswordForm />
        </section>

        {/* Apariencia */}
        <section className={sectionClass}>
          <div>
            <h2 className={headingClass}>Apariencia</h2>
            <p className={subClass}>Elige el tema visual del calendario.</p>
          </div>
          <ThemeSelector />
        </section>

        {/* Configuración de agendamiento */}
        <section className={sectionClass}>
          <div>
            <h2 className={headingClass}>Configuración de agenda</h2>
            <p className={subClass}>
              Horarios, días hábiles y pesos de optimización que usa el motor de agendamiento.
            </p>
          </div>
          <SettingsForm initialValues={settings} initialSlots={slots} />
        </section>

      </main>
    </div>
  );
}
