/**
 * SessionProvider — React layer over the non-React session store.
 *
 * Flow:
 *  - on mount: hydrate tokens from AsyncStorage -> restore the user (GET /api/auth/me)
 *  - login(email, password): POST /api/auth/login, pick a business, store tokens
 *  - switchBusiness(id): set x-business-id for all subsequent calls
 *  - forced logout: apiFetch notifies us when a refresh attempt fails
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { apiFetch, onForcedLogout, ApiClientError } from './api/client';
import {
  clearSession, getSession, hydrateSession, setSession, subscribeSession,
} from './api/session';

export interface Membership {
  businessId: string;
  businessName: string;
  currency: string;
  role: string;
}

export interface Session {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: { id: string; email: string; fullName: string } | null;
  memberships: Membership[];
  businessId: string | null;
  business: Membership | null;
  role: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchBusiness: (businessId: string) => void;
}

const SessionContext = createContext<Session | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<Session['status']>('loading');
  const [user, setUser] = useState<Session['user']>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const hydrated = useRef(false);

  /** Fetch the profile and, optionally, switch to a chosen business. */
  const loadProfile = useCallback(async (selectBusinessId?: string) => {
    const me = await apiFetch<{ user: any; memberships: Membership[] }>('/api/auth/me');
    setUser(me.user);
    setMemberships(me.memberships);
    const nextId = me.memberships.some((m) => m.businessId === selectBusinessId)
      ? selectBusinessId
      : me.memberships[0]?.businessId ?? null;
    setSession({ businessId: nextId ?? null });
    setBusinessId(nextId ?? null);
  }, []);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    (async () => {
      await hydrateSession();
      const { accessToken, businessId: storedBusinessId } = getSession();
      if (!accessToken) {
        setStatus('signedOut');
        return;
      }
      try {
        await loadProfile(storedBusinessId ?? undefined);
        setStatus('signedIn');
      } catch {
        // Expired/invalid stored token but refresh may still work — apiFetch
        // auto-refreshes on 401, so an error here means no valid session.
        clearSession();
        setStatus('signedOut');
      }
    })();
  }, [loadProfile]);

  useEffect(() => {
    const off = onForcedLogout(() => {
      setUser(null);
      setMemberships([]);
      setBusinessId(null);
      setStatus('signedOut');
    });
    return () => {
      off();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const result = await apiFetch<{ accessToken: string; refreshToken: string }>(
        '/api/auth/login',
        { method: 'POST', body: { email, password } }
      );
      setSession({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      await loadProfile(undefined);
      setStatus('signedIn');
    } catch (err) {
      // Normalize so the login form can show a clean message.
      throw new Error(err instanceof ApiClientError ? err.message : 'Login failed');
    }
  }, [loadProfile]);

  const logout = useCallback(async () => {
    try {
      const { refreshToken } = getSession();
      await apiFetch('/api/auth/logout', { method: 'POST', body: { refreshToken } });
    } catch {
      // Ignore — clearing local state is what matters.
    }
    clearSession();
    setUser(null);
    setMemberships([]);
    setBusinessId(null);
    setStatus('signedOut');
  }, []);

  const switchBusiness = useCallback((id: string) => {
    setSession({ businessId: id });
    setBusinessId(id);
  }, []);

  const business = useMemo(
    () => memberships.find((m) => m.businessId === businessId) ?? null,
    [memberships, businessId]
  );

  const value: Session = useMemo(
    () => ({ status, user, memberships, businessId, business, role: business?.role ?? null, login, logout, switchBusiness }),
    [status, user, memberships, businessId, business, login, logout, switchBusiness]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): Session => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
};
