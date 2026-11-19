'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, jsonBody } from '@/lib/api';
import type { User } from '@/lib/types';

interface LoginInput { email: string; password: string }
interface RegisterInput extends LoginInput { name: string; consent: true }
interface ProfileInput { name: string; phoneNumber?: string; preferredCurrency: string }
interface PasswordInput { currentPassword: string; newPassword: string }

interface AuthContextValue {
  user: User | null;
  loading: boolean;
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

  const reload = useCallback(async () => {
    try {
      const current = await apiRequest<User>('/auth/me');
      setUser(current);
      return current;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(input) {
      await apiRequest('/auth/login', { method: 'POST', ...jsonBody(input) }, false);
      const current = await apiRequest<User>('/auth/me', {}, false);
      setUser(current);
      return current;
    },
    async register(input) {
      await apiRequest('/auth/register', { method: 'POST', ...jsonBody(input) }, false);
    },
    async logout() {
      try { await apiRequest('/auth/logout', { method: 'POST' }, false); } finally { setUser(null); }
    },
    async updateProfile(input) {
      const updated = await apiRequest<User>('/users/me', { method: 'PATCH', ...jsonBody(input) });
      setUser(updated);
      return updated;
    },
    async changePassword(input) {
      await apiRequest('/users/me/password', { method: 'PATCH', ...jsonBody(input) });
      setUser(null);
    },
    async deactivate() {
      await apiRequest('/users/me/deactivate', { method: 'POST', ...jsonBody({ confirmation: true }) });
      setUser(null);
    },
    reload,
  }), [loading, reload, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
