import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Free-tier hosts (Render) spin the instance down after ~15 minutes idle, and a
// cold start measured 50-70s. A 30s timeout aborts mid-boot and reports failure
// for requests the server actually goes on to complete — e.g. a registration
// that succeeds while the user is told it timed out.
const REQUEST_TIMEOUT_MS = 90_000;

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: REQUEST_TIMEOUT_MS,
  // The refresh token lives in an httpOnly cookie, which the browser will only
  // attach to a cross-site request when credentials are enabled.
  withCredentials: true,
});

/**
 * Wake a sleeping backend without blocking anything.
 *
 * Called once when the app mounts so the instance boots while the user is still
 * reading the page or filling a form, instead of on their first real action.
 * Deliberately bypasses `apiClient` (no auth header, no interceptors) and
 * swallows every error — this is best-effort only.
 */
export function warmUpApi(): void {
  if (typeof window === "undefined") return;
  void fetch(`${API_URL}/health`, {
    method: "GET",
    cache: "no-store",
    keepalive: true,
  }).catch(() => {
    /* offline or still booting — the real request will surface any problem */
  });
}

// ── Request interceptor: inject access token ──────────────────────────────────
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ── Response interceptor: handle 401 → refresh → retry ───────────────────────
let _refreshing = false;
let _queue: Array<(token: string | null) => void> = [];

function processQueue(token: string | null) {
  _queue.forEach((cb) => cb(token));
  _queue = [];
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !original._retry) {
      if (_refreshing) {
        return new Promise((resolve, reject) => {
          _queue.push((token) => {
            if (token) {
              original.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(original));
            } else {
              reject(error);
            }
          });
        });
      }

      original._retry = true;
      _refreshing = true;

      try {
        const store = useAuthStore.getState();
        const newToken = await store.refresh();
        if (newToken) {
          original.headers.Authorization = `Bearer ${newToken}`;
          processQueue(newToken);
          return apiClient(original);
        }
      } catch {
        processQueue(null);
        useAuthStore.getState().logout();
      } finally {
        _refreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── Error shapes ─────────────────────────────────────────────────────────────
// The API normally returns {error, message} and, for validation failures,
// {error, message, fields}. `detail` is handled too as a fallback for anything
// that bypasses our handlers (e.g. a raw FastAPI HTTPException).

interface ApiErrorBody {
  error?: string;
  message?: string;
  fields?: Record<string, string>;
  detail?: string | Array<{ loc?: (string | number)[]; msg?: string }>;
}

function bodyOf(err: unknown): ApiErrorBody | null {
  if (!axios.isAxiosError(err)) return null;
  const data = err.response?.data;
  return data && typeof data === "object" ? (data as ApiErrorBody) : null;
}

/** A single human-readable sentence suitable for a toast or alert bar. */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = bodyOf(err);

    if (body?.message) return body.message;

    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) {
      const first = body.detail[0];
      if (first?.msg) {
        const field = first.loc?.filter((p) => p !== "body").join(".");
        return field ? `${field}: ${first.msg}` : first.msg;
      }
    }

    // Network-level failures have no response at all — the generic axios text
    // ("Network Error") is not actionable, so say something useful.
    if (!err.response) {
      return err.code === "ECONNABORTED" || err.code === "ETIMEDOUT"
        ? "The server took too long to respond. It may have been asleep — " +
            "please try once more."
        : "Cannot reach the server. Check your connection and try again.";
    }

    if (err.response.status >= 500) {
      return "Something went wrong on our end. Please try again in a moment.";
    }

    return err.message ?? "Something went wrong";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

/**
 * Per-field validation messages, keyed by field name, for rendering inline
 * under form inputs. Empty object when the error is not field-specific.
 */
export function getFieldErrors(err: unknown): Record<string, string> {
  const body = bodyOf(err);
  if (body?.fields) return body.fields;

  if (Array.isArray(body?.detail)) {
    const out: Record<string, string> = {};
    for (const d of body.detail) {
      const field = d.loc?.filter((p) => p !== "body").join(".");
      if (field && d.msg && !(field in out)) out[field] = d.msg;
    }
    return out;
  }
  return {};
}

/** True when the failure is a duplicate/already-exists conflict (HTTP 409). */
export function isConflictError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 409;
}
