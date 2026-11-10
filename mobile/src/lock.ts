// When to ask for Face ID / Touch ID before showing church data. Kept free of
// React Native imports so the rules run under node --test.

// Coming back to the app after this long away asks again; a quick switch to Mail doesn't.
export const LOCK_AFTER_MS = 5 * 60 * 1000;
export const BIOMETRIC_LOCK_KEY = 'pulse.biometricLock';

export type LockInputs = {
  enabled: boolean;      // the person's setting (on by default)
  available: boolean;    // the phone has Face ID / Touch ID set up
  signedIn: boolean;
};

// A session restored when the app launches is locked; a fresh sign-in isn't,
// since the person just proved who they are.
export function lockOnLaunch(inputs: LockInputs, restoredSession: boolean): boolean {
  return inputs.enabled && inputs.available && inputs.signedIn && restoredSession;
}

export function lockOnReturn(inputs: LockInputs, backgroundedAt: number | null, now: number): boolean {
  if (!inputs.enabled || !inputs.available || !inputs.signedIn || backgroundedAt === null) return false;
  return now - backgroundedAt >= LOCK_AFTER_MS;
}

// Stored as 'off' only when the person turns it off, so it defaults to on.
export const lockSettingFrom = (stored: string | null) => stored !== 'off';

// LocalAuthentication.AuthenticationType values: 1 fingerprint, 2 facial recognition, 3 iris.
export function biometryLabel(types: number[]): string {
  if (types.includes(2)) return 'Face ID';
  if (types.includes(1)) return 'Touch ID';
  if (types.includes(3)) return 'Optic ID';
  return 'your passcode';
}
