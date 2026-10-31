// Pure session rules, kept free of React Native imports so they run under node --test.
export type Session = { idToken: string; refreshToken?: string | null };
export type TokenClaims = { exp?: number; email?: string; sub?: string; [key: string]: unknown };

// Refresh a little early so a token never expires mid-request.
export const EXPIRY_SKEW_SECONDS = 60;

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  return decodeURIComponent(Array.from(atob(base64), char => '%' + char.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
}

// Reads claims for display and expiry only. The server verifies the signature.
export function decodeClaims(token: string): TokenClaims | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try { return JSON.parse(decodeBase64Url(payload)); } catch { return null; }
}

export function isExpired(token: string, nowMs = Date.now(), skewSeconds = EXPIRY_SKEW_SECONDS): boolean {
  const exp = decodeClaims(token)?.exp;
  return typeof exp !== 'number' || exp * 1000 <= nowMs + skewSeconds * 1000;
}

export type NextStep = 'use' | 'refresh' | 'sign-in';
export function nextStep(session: Session | null, nowMs = Date.now()): NextStep {
  if (!session?.idToken) return 'sign-in';
  if (!isExpired(session.idToken, nowMs)) return 'use';
  return session.refreshToken ? 'refresh' : 'sign-in';
}

export function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return typeof value?.idToken === 'string' ? { idToken: value.idToken, refreshToken: value.refreshToken ?? null } : null;
  } catch { return null; }
}
