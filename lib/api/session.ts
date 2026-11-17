/**
 * Session store — holds auth tokens + selected business OUTSIDE React so the
 * API client can read them synchronously. The React layer (SessionProvider)
 * subscribes to changes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  accessToken: 'stoku.accessToken',
  refreshToken: 'stoku.refreshToken',
  businessId: 'stoku.businessId',
};

export interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  businessId: string | null;
}

let state: SessionState = { accessToken: null, refreshToken: null, businessId: null };
const listeners = new Set<(s: SessionState) => void>();

export const getSession = () => state;

export const setSession = (patch: Partial<SessionState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
  // Persist (fire and forget — reads on startup hydrate the store).
  for (const [key, value] of Object.entries(patch)) {
    const storageKey = KEYS[key as keyof SessionState];
    if (value == null) AsyncStorage.removeItem(storageKey).catch(() => {});
    else AsyncStorage.setItem(storageKey, value).catch(() => {});
  }
};

export const clearSession = () =>
  setSession({ accessToken: null, refreshToken: null, businessId: null });

export const subscribeSession = (listener: (s: SessionState) => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Load persisted tokens at app start. */
export const hydrateSession = async (): Promise<SessionState> => {
  const [accessToken, refreshToken, businessId] = await Promise.all([
    AsyncStorage.getItem(KEYS.accessToken),
    AsyncStorage.getItem(KEYS.refreshToken),
    AsyncStorage.getItem(KEYS.businessId),
  ]);
  state = { accessToken, refreshToken, businessId };
  return state;
};
