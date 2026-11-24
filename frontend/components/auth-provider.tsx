"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiRequest, ApiError, jsonBody } from "@/lib/api";
import type { User } from "@/lib/types";

interface LoginInput {
  email: string;
  password: string;
}
interface RegisterInput extends LoginInput {
  name: string;
  consent: true;
}
interface ProfileInput {
  name: string;
  phoneNumber?: string;
  preferredCurrency: string;
}
interface PasswordInput {
  currentPassword: string;
  newPassword: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  sessionError: string;
  exitPath: string;
  login(input: LoginInput): Promise<User>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  updateProfile(input: ProfileInput): Promise<User>;
  changePassword(input: PasswordInput): Promise<void>;
  deactivate(): Promise<void>;
  reload(): Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [exitPath, setExitPath] = useState("");
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const version = generation.current;
    try {
      const current = await apiRequest<User>("/auth/me");
      if (generation.current === version) {
        setUser(current);
        setSessionError("");
      }
      return current;
    } catch (error) {
      if (generation.current === version) {
        if (error instanceof ApiError && error.status === 401) setUser(null);
        else
          setSessionError("Unable to verify your session. Please try again.");
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const version = generation.current;
    apiRequest<User>("/auth/me")
      .then((current) => {
        if (active && version === generation.current) setUser(current);
      })
      .catch((error) => {
        if (active && version === generation.current) {
          if (error instanceof ApiError && error.status === 401) setUser(null);
          else
            setSessionError("Unable to verify your session. Please try again.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const expire = () => {
      generation.current++;
      setUser(null);
      setSessionError("");
      setExitPath("");
    };
    const force = () =>
      setUser((current) =>
        current ? { ...current, mustChangePassword: true } : current,
      );
    const revalidate = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("triplify:session-expired", expire);
    window.addEventListener("triplify:password-required", force);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("triplify:session-expired", expire);
      window.removeEventListener("triplify:password-required", force);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [reload]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      sessionError,
      exitPath,
      async login(input) {
        generation.current++;
        await apiRequest(
          "/auth/login",
          { method: "POST", ...jsonBody(input) },
          false,
        );
        const current = await apiRequest<User>("/auth/me", {}, false);
        setUser(current);
        setSessionError("");
        setExitPath("");
        return current;
      },
      async register(input) {
        await apiRequest(
          "/auth/register",
          { method: "POST", ...jsonBody(input) },
          false,
        );
      },
      async logout() {
        await apiRequest("/auth/logout", { method: "POST" });
        generation.current++;
        setExitPath("/");
        setUser(null);
      },
      async updateProfile(input) {
        const updated = await apiRequest<User>("/users/me", {
          method: "PATCH",
          ...jsonBody(input),
        });
        setUser(updated);
        return updated;
      },
      async changePassword(input) {
        await apiRequest("/users/me/password", {
          method: "PATCH",
          ...jsonBody(input),
        });
        generation.current++;
        setExitPath("/login?passwordChanged=1");
        setUser(null);
      },
      async deactivate() {
        await apiRequest("/users/me/deactivate", {
          method: "POST",
          ...jsonBody({ confirmation: true }),
        });
        generation.current++;
        setExitPath("/login?deactivated=1");
        setUser(null);
      },
      reload,
    }),
    [loading, reload, user, sessionError, exitPath],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
