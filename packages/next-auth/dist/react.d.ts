import type { ReactNode } from "react";
import type { Session } from "./index";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type SessionContextValue = {
  data: Session | null;
  status: SessionStatus;
  update?: (session: Session | null) => void;
};

export declare function SessionProvider(props: { children: ReactNode; session?: Session | null }): JSX.Element;
export declare function useSession(): SessionContextValue;
export declare function signIn(
  provider: "credentials",
  options?: {
    redirect?: boolean;
    callbackUrl?: string;
    [key: string]: unknown;
  },
): Promise<{ ok?: boolean; url?: string; error?: string }>;
export declare function signOut(options?: { redirect?: boolean; callbackUrl?: string }): Promise<void>;
