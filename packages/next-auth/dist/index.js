import { randomBytes } from "node:crypto";
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

function parseCookieHeader(header) {
  const pairs = (header ?? "").split(";");
  const result = new Map();

  for (const pair of pairs) {
    if (!pair) continue;
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!name) continue;
    result.set(name, decodeURIComponent(value));
  }

  return result;
}

function extractSessionFromHeader(header) {
  const cookiesMap = parseCookieHeader(header);
  const raw = cookiesMap.get(SESSION_COOKIE);
  if (!raw) return null;
  return readSession(raw);
}

function sanitizeSessionPayload(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  if (raw.session && typeof raw.session === "object") {
    return raw.session;
  }

  const { sessionToken: _sessionToken, ...session } = raw;
  return session;
}

export default function NextAuth(options) {
  const adapter = options.adapter;
  const providers = options.providers ?? [];
  const credentialsProvider = providers.find((provider) => provider?.type === "credentials");

  if (!adapter) {
    throw new Error("[local-next-auth] Se requiere un adaptador para inicializar NextAuth");
  }

  if (!credentialsProvider) {
    throw new Error("[local-next-auth] Debes configurar un proveedor de credenciales");
  }

  const sessionMaxAge = options.session?.maxAge ?? 60 * 60 * 24;

  async function buildSession(user) {
    let token = { sub: user.id };

    if (options.callbacks?.jwt) {
      token = await options.callbacks.jwt({ token, user });
    }

    let session = { user };

    if (options.callbacks?.session) {
      session = await options.callbacks.session({ session, token });
    }

    return { session, token };
  }

  async function handleCredentialsCallback(request) {
    let body = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const authorizedUser = await credentialsProvider.authorize(body, request);

    if (!authorizedUser) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    const user = {
      id: authorizedUser.id,
      email: authorizedUser.email ?? null,
      name: authorizedUser.name ?? null,
      image: authorizedUser.image ?? null,
    };

    const { session } = await buildSession(user);

    const sessionToken = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + sessionMaxAge * 1000);

    await adapter.createSession({
      sessionToken,
      userId: user.id,
      expires,
    });

    const response = NextResponse.json({ session });
    __internalSetSessionCookie(response, { ...session, sessionToken }, { maxAge: sessionMaxAge });

    return response;
  }

  async function handleGetSession(request) {
    const payload = extractSessionFromHeader(request.headers.get("cookie"));

    if (!payload?.sessionToken) {
      return NextResponse.json({ session: null });
    }

    const sessionAndUser = await adapter.getSessionAndUser(payload.sessionToken);

    if (!sessionAndUser) {
      const response = NextResponse.json({ session: null });
      __internalClearSessionCookie(response);
      return response;
    }

    const user = {
      id: sessionAndUser.user.id,
      email: sessionAndUser.user.email ?? null,
      name: sessionAndUser.user.name ?? null,
      image: sessionAndUser.user.image ?? null,
    };

    const { session } = await buildSession(user);

    const response = NextResponse.json({ session });
    __internalSetSessionCookie(response, { ...session, sessionToken: payload.sessionToken }, { maxAge: sessionMaxAge });

    return response;
  }

  async function handleSignOut(request) {
    const payload = extractSessionFromHeader(request.headers.get("cookie"));

    if (payload?.sessionToken) {
      await adapter.deleteSession(payload.sessionToken);
    }

    const response = NextResponse.json({ ok: true });
    __internalClearSessionCookie(response);
    return response;
  }

  return async function handler(request) {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const authIndex = segments.indexOf("auth");
    const action = authIndex >= 0 ? segments.slice(authIndex + 1) : [];

    if (request.method === "POST" && action[0] === "callback" && action[1] === credentialsProvider.id) {
      return handleCredentialsCallback(request);
    }

    if (request.method === "GET" && action[0] === "session") {
      return handleGetSession(request);
    }

    if (request.method === "POST" && action[0] === "signout") {
      return handleSignOut(request);
    }

    return NextResponse.json({ error: "Ruta de autenticación no implementada" }, { status: 404 });
  };
}

export async function getServerSession() {
  const store = cookies();
  const cookie = store.get(SESSION_COOKIE);
  if (!cookie) {
    return null;
  }
  const payload = readSession(cookie.value);
  return sanitizeSessionPayload(payload);
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
