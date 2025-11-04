import type { NextResponse } from "next/server";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export type Session = {
  user: SessionUser;
} & Record<string, unknown>;

export type CredentialsAuthorizeParams = Record<string, unknown>;

export type CredentialsProvider = {
  id: string;
  type: "credentials";
  authorize: (credentials: CredentialsAuthorizeParams, request: Request) => Promise<SessionUser | null> | SessionUser | null;
};

export type AdapterSession = {
  sessionToken: string;
  userId: string;
  expires: Date;
};

export type AdapterUser = SessionUser & { email?: string | null };

export type Adapter = {
  createSession: (data: AdapterSession) => Promise<unknown>;
  getSessionAndUser: (
    sessionToken: string,
  ) => Promise<{ session: AdapterSession; user: AdapterUser } | null>;
  deleteSession: (sessionToken: string) => Promise<unknown>;
};

export type JwtCallbackParams = {
  token: Record<string, unknown>;
  user?: SessionUser;
};

export type SessionCallbackParams = {
  session: Session;
  token: Record<string, unknown>;
};

export type NextAuthOptions = {
  adapter: Adapter;
  providers: CredentialsProvider[];
  callbacks?: {
    jwt?: (params: JwtCallbackParams) => Promise<Record<string, unknown>> | Record<string, unknown>;
    session?: (params: SessionCallbackParams) => Promise<Session> | Session;
  };
  session?: {
    maxAge?: number;
  };
  secret?: string;
};

export default function NextAuth(options: NextAuthOptions): (request: Request) => Promise<NextResponse>;

export declare function getServerSession<TSession extends Session = Session>(): Promise<TSession | null>;
export declare function getSessionCookieName(): string;
export declare function __internalSetSessionCookie(
  response: NextResponse,
  session: Session & { sessionToken?: string },
  options?: Partial<import("next/dist/server/web/spec-extension/cookies").ResponseCookie>,
): void;
export declare function __internalClearSessionCookie(response: NextResponse): void;
