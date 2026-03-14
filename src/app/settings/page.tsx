import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const suffix = params.first === '1' ? '?first=1' : '';
  redirect(`/profile${suffix}`);
}
