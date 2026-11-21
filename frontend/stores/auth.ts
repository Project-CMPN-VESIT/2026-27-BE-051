import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { authApi } from "@/lib/api";
import { clearQueryCache } from "@/lib/query-client";
import type { User } from "@/types";

interface AuthState {
  accessToken: string | null;
  user: User | null;
  isLoading: boolean;

  /** Store the access token after sign-in. The refresh token is a cookie. */
  setTokens: (access: string) => void;
  setUser: (user: User) => void;
  refresh: () => Promise<string | null>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      isLoading: false,

      // Called on sign-in, registration and OAuth callback — i.e. whenever the
      // identity may have changed. Any cache from a previous session belongs to
      // a different user, so it has to go before the new one renders.
      setTokens: (access) => {
        clearQueryCache();
        set({ accessToken: access, user: null });
      },

      setUser: (user) => set({ user }),

      // The refresh token is an httpOnly cookie: unreadable here by design, and
      // sent automatically. A 401 means the cookie is missing, expired, or was
      // already rotated, so the only correct response is to sign out.
      refresh: async () => {
        try {
          const data = await authApi.refresh();
          set({ accessToken: data.access_token });
          return data.access_token;
        } catch {
          get().logout();
          return null;
        }
      },

      // Covers all three exits: the navbar button, a failed token refresh here,
      // and the 401 handler in the axios interceptor.
      logout: () => {
        clearQueryCache();
        set({ accessToken: null, user: null });
      },
    }),
    {
      name: "cb-auth",
      storage: createJSONStorage(() => localStorage),
      // Only the short-lived access token is persisted. The refresh token is a
      // cookie the browser manages, deliberately out of reach of JavaScript.
      partialize: (s) => ({ accessToken: s.accessToken }),
    }
  )
);

// ── Hydration ────────────────────────────────────────────────────────────────
// `accessToken` is read from localStorage *after* mount, so on the server and on
// the first client render it is always null. Any UI that branches on it will
// therefore render its signed-out state first and then correct itself — which is
// exactly the flash that made a signed-in user see "Log in / Sign up" in the
// navbar. Components that must not guess should wait for this to turn true.
//
// Subscriber and snapshot are module-level so they're referentially stable;
// inline closures would resubscribe on every render.
const subscribeHydration = (onChange: () => void) =>
  useAuthStore.persist.onFinishHydration(onChange);
const getHydrated = () => useAuthStore.persist.hasHydrated();
const getHydratedOnServer = () => false;

/** True once the persisted session has been read from storage. */
export function useAuthHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, getHydrated, getHydratedOnServer);
}
