import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "ai_session";

function readSession(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn("[local-next-auth] No se pudo parsear la cookie de sesión", error);
    return null;
  }
}

export async function getServerSession() {
  const store = cookies();
  const cookie = store.get(SESSION_COOKIE);
  if (!cookie) {
    return null;
  }
  return readSession(cookie.value);
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function __internalSetSessionCookie(response, session, options = {}) {
  if (!(response instanceof NextResponse)) {
    throw new Error("El helper '__internalSetSessionCookie' requiere un NextResponse");
  }
  response.cookies.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    ...options,
  });
}

export function __internalClearSessionCookie(response) {
  if (!(response instanceof NextResponse)) {
    throw new Error("El helper '__internalClearSessionCookie' requiere un NextResponse");
  }
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
