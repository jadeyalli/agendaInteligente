import { createContext, useContext, useEffect, useMemo, useState } from "react";

const SessionContext = createContext({
  data: null,
  status: "loading",
});

export function SessionProvider({ children, session = null }) {
  const [currentSession, setCurrentSession] = useState(session);

  useEffect(() => {
    setCurrentSession(session);
  }, [session]);

  const value = useMemo(() => {
    return {
      data: currentSession,
      status: currentSession ? "authenticated" : "unauthenticated",
      update: setCurrentSession,
    };
  }, [currentSession]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export async function signIn(provider, options = {}) {
  if (provider !== "credentials") {
    throw new Error(`Proveedor "${provider}" no soportado en esta implementación`);
  }
  const { redirect = true, callbackUrl = "/", ...credentials } = options;
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });
  if (!response.ok) {
    let errorMessage = "ErrorDesconocido";
    try {
      const payload = await response.json();
      errorMessage = payload?.error ?? errorMessage;
    } catch (error) {
      console.warn("[local-next-auth] No se pudo leer la respuesta del login", error);
    }
    return { error: errorMessage };
  }
  if (redirect && typeof window !== "undefined") {
    window.location.href = callbackUrl;
  }
  return { ok: true, url: callbackUrl };
}

export async function signOut(options = {}) {
  const { redirect = true, callbackUrl = "/login" } = options;
  await fetch("/api/auth/logout", { method: "POST" });
  if (redirect && typeof window !== "undefined") {
    window.location.href = callbackUrl;
  }
}
