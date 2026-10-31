import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { config } from './config.ts';
import { createApi, type Api } from './api.ts';
import { decodeClaims, nextStep, parseSession, type Session } from './session.ts';

// Closes the sign-in browser tab when Access redirects back to the app.
WebBrowser.maybeCompleteAuthSession();

const SESSION_KEY = 'pulse.session';
const discovery = {
  authorizationEndpoint: `${config.issuer}/authorization`,
  tokenEndpoint: `${config.issuer}/token`,
};
const redirectUri = AuthSession.makeRedirectUri({ scheme: config.scheme, path: config.redirectPath });

type AuthState = {
  status: 'loading' | 'signed-out' | 'signed-in';
  email: string | null;
  error: string | null;
  busy: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  api: Api;
};
const AuthContext = createContext<AuthState | null>(null);

async function save(session: Session | null) {
  if (session) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  else await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const refreshing = useRef<Promise<string | null> | null>(null);

  const [request, , promptAsync] = AuthSession.useAuthRequest({
    clientId: config.clientId,
    redirectUri,
    scopes: ['openid', 'email', 'profile'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  }, discovery);

  const update = useCallback(async (next: Session | null) => {
    sessionRef.current = next;
    setSession(next);
    setStatus(next ? 'signed-in' : 'signed-out');
    await save(next).catch(() => {});
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(SESSION_KEY)
      .then(raw => {
        const stored = parseSession(raw);
        const step = nextStep(stored);
        sessionRef.current = step === 'sign-in' ? null : stored;
        setSession(sessionRef.current);
        setStatus(sessionRef.current ? 'signed-in' : 'signed-out');
      })
      .catch(() => setStatus('signed-out'));
  }, []);

  // Returns a usable ID token, refreshing it once if needed; concurrent callers share one refresh.
  const getToken = useCallback(async (): Promise<string | null> => {
    const current = sessionRef.current;
    const step = nextStep(current);
    if (step === 'use') return current!.idToken;
    if (step === 'sign-in') { if (current) await update(null); return null; }
    refreshing.current ??= AuthSession.refreshAsync({ clientId: config.clientId, refreshToken: current!.refreshToken! }, discovery)
      .then(async tokens => {
        if (!tokens.idToken) throw new Error('No ID token in refresh response');
        await update({ idToken: tokens.idToken, refreshToken: tokens.refreshToken ?? current!.refreshToken });
        return tokens.idToken;
      })
      .catch(async () => { await update(null); return null; })
      .finally(() => { refreshing.current = null; });
    return refreshing.current;
  }, [update]);

  const signIn = useCallback(async () => {
    if (!request) return;
    setError(null);
    setBusy(true);
    try {
      const result = await promptAsync();
      if (result.type !== 'success') {
        if (result.type === 'error') setError(result.error?.message || 'Sign-in failed. Try again.');
        return;
      }
      const tokens = await AuthSession.exchangeCodeAsync({
        clientId: config.clientId,
        code: result.params.code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier ?? '' },
      }, discovery);
      if (!tokens.idToken) throw new Error('Sign-in did not return an ID token.');
      await update({ idToken: tokens.idToken, refreshToken: tokens.refreshToken ?? null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  }, [request, promptAsync, update]);

  const signOut = useCallback(() => update(null), [update]);

  const api = useMemo(() => createApi({ baseUrl: config.apiBase, getToken, onUnauthorized: () => { update(null); } }), [getToken, update]);
  const email = session ? (decodeClaims(session.idToken)?.email as string | undefined) ?? null : null;

  const value = useMemo<AuthState>(() => ({ status, email, error, busy: busy || !request, signIn, signOut, api }),
    [status, email, error, busy, request, signIn, signOut, api]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
