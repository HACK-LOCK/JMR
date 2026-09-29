import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser } from '@shared/domain';
import {
  ApiError,
  clearSession,
  getStoredUser,
  getToken,
  setSession,
  setUnauthorizedHandler,
} from './api';
import { api } from './api';

interface AuthValue {
  user: AuthUser | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser<AuthUser>());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setReady(true);
      return () => {
        cancelled = true;
      };
    }
    api
      .get<AuthUser>('/auth/me')
      .then((response) => {
        if (!cancelled) setUser(response.data);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          if (!cancelled) setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      ready,
      signIn: async (username: string, password: string) => {
        const response = await api.post<{ token: string; user: AuthUser }>('/auth/login', {
          username,
          password,
        });
        setSession(response.data.token, response.data.user);
        setUser(response.data.user);
      },
      signOut: () => {
        clearSession();
        setUser(null);
      },
    }),
    [user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The bills live in an online database, so more than one device can be
        // used at the counter. Every screen therefore re-reads on a timer: a
        // list that only loaded once would keep showing the shop as it was when
        // the page was opened, which is how two people end up giving the same
        // customer two different answers. The server answers from memory, so
        // this is a small request rather than a database query.
        refetchInterval: 5_000,
        // Nothing is treated as fresh for long, so navigating always re-reads
        // and a screen that was left open for a while shows what is there now.
        staleTime: 0,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(error.status)) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function AppProviders({ children }: { children: ReactNode }): JSX.Element {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
