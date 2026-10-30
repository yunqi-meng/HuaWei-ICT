import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setCsrf } from "./api";

export interface Me {
  id: string;
  email: string;
  display_name: string;
  roles: string[];
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
}

const Ctx = createContext<AuthCtx>(null as never);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const user = await api<Me>("/auth/me");
        setMe(user);
        const { csrf_token } = await api<{ csrf_token: string }>("/auth/csrf");
        if (csrf_token) setCsrf(csrf_token);
      } catch {
        setMe(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const resp = await api<Me & { csrf_token: string }>("/auth/login", {
      body: { email, password },
    });
    setCsrf(resp.csrf_token);
    setMe({ id: resp.id, email: resp.email, display_name: resp.display_name, roles: resp.roles });
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const resp = await api<Me & { csrf_token: string }>("/auth/register", {
      body: { email, password, display_name: name },
    });
    setCsrf(resp.csrf_token);
    setMe({ id: resp.id, email: resp.email, display_name: resp.display_name, roles: resp.roles });
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setCsrf("");
    setMe(null);
  }, []);

  const hasRole = useCallback(
    (...roles: string[]) => !!me && roles.some((r) => me.roles.includes(r)),
    [me]
  );

  return <Ctx.Provider value={{ me, loading, login, register, logout, hasRole }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
