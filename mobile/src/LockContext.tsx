import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from './AuthContext.tsx';
import { BIOMETRIC_LOCK_KEY, biometryLabel, lockOnLaunch, lockOnReturn, lockSettingFrom } from './lock.ts';

type LockState = {
  ready: boolean;
  locked: boolean;
  enabled: boolean;
  available: boolean;
  label: string;
  // Each returns an error message to show, or null.
  unlock: () => Promise<string | null>;
  setEnabled: (enabled: boolean) => Promise<string | null>;
};
const LockContext = createContext<LockState | null>(null);
const CANCELLED = new Set(['user_cancel', 'system_cancel', 'app_cancel']);

// Asks for Face ID / Touch ID (falling back to the phone's passcode) when a saved sign-in is
// opened, and again after five minutes away, so a borrowed or lost phone doesn't show church data.
export function LockProvider({ children }: { children: ReactNode }) {
  const { status, restored } = useAuth();
  const [enabled, setEnabledState] = useState(true);
  const [hardware, setHardware] = useState<{ available: boolean; label: string } | null>(null);
  const [locked, setLocked] = useState(false);
  const launchChecked = useRef(false);
  const backgroundedAt = useRef<number | null>(null);
  const signedIn = status === 'signed-in';
  const inputs = { enabled, available: !!hardware?.available, signedIn };
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(BIOMETRIC_LOCK_KEY).catch(() => null),
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]).then(([stored, hasHardware, enrolled, types]) => {
      setEnabledState(lockSettingFrom(stored));
      setHardware({ available: hasHardware && enrolled, label: biometryLabel(types) });
    }).catch(() => setHardware({ available: false, label: biometryLabel([]) }));
  }, []);

  const ready = hardware !== null && status !== 'loading';

  // Decide once, after launch, whether the restored sign-in needs unlocking.
  useEffect(() => {
    if (!ready || launchChecked.current) return;
    launchChecked.current = true;
    if (lockOnLaunch(inputs, restored)) setLocked(true);
  }, [ready]);

  useEffect(() => { if (!signedIn) setLocked(false); }, [signedIn]);

  // The Face ID prompt itself only makes the app "inactive", so only a real trip to the background counts.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active') {
        if (lockOnReturn(inputsRef.current, backgroundedAt.current, Date.now())) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => subscription.remove();
  }, []);

  const authenticate = useCallback(async (promptMessage: string) => {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage, fallbackLabel: 'Use passcode' });
    if (result.success) return null;
    return CANCELLED.has(result.error) ? '' : `Couldn't confirm it's you. Try ${hardware?.label ?? 'again'}.`;
  }, [hardware]);

  const unlock = useCallback(async () => {
    const problem = await authenticate('Unlock Skyline Pulse');
    if (problem === null) setLocked(false);
    return problem || null;
  }, [authenticate]);

  // Turning the lock off needs the same proof as unlocking, so someone holding an
  // unlocked phone can't quietly disable it.
  const setEnabled = useCallback(async (next: boolean) => {
    if (!next) {
      const problem = await authenticate('Turn off the app lock');
      if (problem !== null) return problem || null;
    }
    setEnabledState(next);
    await AsyncStorage.setItem(BIOMETRIC_LOCK_KEY, next ? 'on' : 'off').catch(() => {});
    return null;
  }, [authenticate]);

  const value = useMemo<LockState>(() => ({
    ready, locked, enabled, available: !!hardware?.available, label: hardware?.label ?? 'Face ID', unlock, setEnabled,
  }), [ready, locked, enabled, hardware, unlock, setEnabled]);
  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock(): LockState {
  const value = useContext(LockContext);
  if (!value) throw new Error('useLock must be used inside LockProvider');
  return value;
}
