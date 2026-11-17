/**
 * Shared feedback UI: Toast + ConfirmDialog + loading/error views.
 *
 * - useToast(): transient snackbars (success/failure/user guidance)
 * - useConfirm(): promise-based confirmation dialog for consequential actions
 * Both work identically on native and web (react-native-web).
 */
import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState, useEffect,
} from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BorderRadius, Spacing, Typography, type ThemeColors,
} from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { Button } from './button';

// ───────────────────────────── Toast ─────────────────────────────

type Toast = { id: number; text: string; kind: 'success' | 'error' | 'info' };

const ToastContext = createContext<{
  show: (text: string, kind?: Toast['kind']) => void;
} | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const colors = useThemeColors();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const show = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  const colorFor = (kind: Toast['kind']) =>
    kind === 'success' ? colors.success : kind === 'error' ? colors.danger : colors.info;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View style={toastStyles.container} pointerEvents="none">
        {toasts.map((t) => (
          <View
            key={t.id}
            style={[
              toastStyles.toast,
              {
                backgroundColor: colors.text,
                borderColor: colorFor(t.kind),
              },
            ]}>
            <MaterialIcons
              name={t.kind === 'success' ? 'check-circle' : t.kind === 'error' ? 'error-outline' : 'info-outline'}
              size={18}
              color={colorFor(t.kind)}
            />
            <Text style={[toastStyles.text, { color: colors.backgroundSecondary }]} numberOfLines={3}>
              {t.text}
            </Text>
          </View>
        ))}
      </View>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 999,
    gap: 8,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.lg,
    maxWidth: 560,
    width: '100%',
    // subtle elevation
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  text: { flex: 1, fontSize: Typography.sizes.sm, fontWeight: Typography.weights.medium },
});

// ───────────────────────────── Confirm dialog ─────────────────────────────

interface ConfirmOptions {
  title: string;
  message?: string;
  actionLabel?: string;
  danger?: boolean;
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(
  () => Promise.resolve(false)
);

type PendingConfirm = { id: number; options: ConfirmOptions; resolve: (v: boolean) => void } | null;

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const colors = useThemeColors();
  const [pending, setPending] = useState<PendingConfirm>(null);
  const counter = useRef(0);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const id = ++counter.current;
      setPending({ id, options, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        visible={pending != null}
        transparent
        animationType="fade"
        onRequestClose={() => close(false)}>
        <Pressable
          style={[confirmStyles.backdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
          onPress={() => close(false)}>
          <View style={[confirmStyles.card, { backgroundColor: colors.background }]}>
            <Text style={[confirmStyles.title, { color: colors.text }]}>{pending?.options.title}</Text>
            {pending?.options.message ? (
              <Text style={[confirmStyles.message, { color: colors.textSecondary }]}>
                {pending.options.message}
              </Text>
            ) : null}
            <View style={confirmStyles.row}>
              <View style={confirmStyles.button}>
                <Button text="Cancel" variant="secondary" onPress={() => close(false)} />
              </View>
              <View style={confirmStyles.button}>
                <Button
                  text={pending?.options.actionLabel ?? 'Confirm'}
                  variant={pending?.options.danger ? 'danger' : 'primary'}
                  onPress={() => close(true)}
                />
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};

const confirmStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  title: { fontSize: Typography.sizes.lg, fontWeight: Typography.weights.semibold },
  message: { fontSize: Typography.sizes.sm, lineHeight: Typography.lineHeights.normal },
  row: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  button: { flex: 1 },
});

// ───────────────────────── Loading / Error states ─────────────────────────

export const LoadingView: React.FC<{ message?: string }> = ({ message }) => {
  const colors = useThemeColors();
  return (
    <View style={{ borderRadius: BorderRadius.lg }}>
      <View style={[centerStyle, { backgroundColor: colors.backgroundSecondary }]}>
        <Text style={{ color: colors.textSecondary, fontSize: Typography.sizes.sm }}>
          {message ?? 'Loading…'}
        </Text>
      </View>
    </View>
  );
};

export const ErrorView: React.FC<{ error: unknown; retry?: () => void }> = ({ error, retry }) => {
  const colors = useThemeColors();
  const message =
    error instanceof Error ? error.message : String(error ?? 'Something went wrong');
  return (
    <View style={[centerStyle, { backgroundColor: colors.dangerBg, borderRadius: BorderRadius.lg }]}>
      <MaterialIcons name="cloud-off" size={28} color={colors.danger} />
      <Text style={{ color: colors.danger, marginTop: Spacing.sm, textAlign: 'center', maxWidth: 360 }}>
        {message}
      </Text>
      {retry ? (
        <View style={{ marginTop: Spacing.md }}>
          <Button text="Try again" onPress={retry} size="sm" />
        </View>
      ) : null}
    </View>
  );
};

const centerStyle = {
  padding: Spacing['2xl'],
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

export { SafeAreaView as ToastSafe };
