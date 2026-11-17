/** UUID helper — note: React Native may polyfill crypto.randomUUID. */
export const cryptoUUID = (): string => {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
};
