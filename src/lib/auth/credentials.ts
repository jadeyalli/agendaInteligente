import type { Session } from 'next-auth';

const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@agenda.com',
  name: 'Agenda Demo',
};

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'agenda123';

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 horas

export type Credentials = {
  email?: string;
  password?: string;
};

export function authenticateWithCredentials(credentials: Credentials): Session | null {
  const email = credentials.email?.toLowerCase().trim();
  const password = credentials.password ?? '';

  if (email !== DEMO_USER.email || password !== DEMO_PASSWORD) {
    return null;
  }

  const session: Session = {
    user: {
      id: DEMO_USER.id,
      email: DEMO_USER.email,
      name: DEMO_USER.name,
    },
  };

  return session;
}
