'use client';

import type { ReactNode } from 'react';
import type { Session } from 'next-auth';
import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

type Props = {
  children: ReactNode;
  session: Session | null;
};

export default function SessionProvider({ children, session }: Props) {
  return <NextAuthSessionProvider session={session}>{children}</NextAuthSessionProvider>;
}
