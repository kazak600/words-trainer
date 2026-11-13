import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import * as authApi from '../api/auth';
import { ApiError, setUnauthorizedHandler } from '../api/client';

type AuthState =
  | { status: 'loading' }
  | { status: 'in'; username: string }
  | { status: 'out' }
  | { status: 'unreachable' };

type AuthContextValue = {
  state: AuthState;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    authApi
      .fetchMe()
      .then(
        (user) =>
          !cancelled && setState({ status: 'in', username: user.username }),
      )
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status:
            error instanceof ApiError && error.status === 401
              ? 'out'
              : 'unreachable',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ status: 'out' }));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const user = await authApi.login(username, password);
    setState({ status: 'in', username: user.username });
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setState({ status: 'out' });
  }, []);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return (
    <AuthContext.Provider value={{ state, login, logout, retry }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
