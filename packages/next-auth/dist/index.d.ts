import type { NextResponse } from "next/server";

export type SessionUser = {
  id: string;
  email: string;
  name?: string;
};

export type Session = {
  user: SessionUser;
};

export declare function getServerSession<TSession extends Session = Session>(): Promise<TSession | null>;
export declare function getSessionCookieName(): string;
export declare function __internalSetSessionCookie(
  response: NextResponse,
  session: Session,
  options?: Partial<import("next/dist/server/web/spec-extension/cookies").ResponseCookie>,
): void;
export declare function __internalClearSessionCookie(response: NextResponse): void;
