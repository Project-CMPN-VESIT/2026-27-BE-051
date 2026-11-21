import type { QueryClient } from "@tanstack/react-query";

/**
 * Bridge so non-React code (the auth store, the axios interceptor) can drop the
 * query cache when the signed-in identity changes.
 *
 * The client itself is still created inside the Providers component rather than
 * as a module singleton — a singleton would be shared across requests when this
 * module is evaluated on the server. We only keep a reference to it here.
 */
let _client: QueryClient | null = null;

export function registerQueryClient(client: QueryClient): void {
  _client = client;
}

/**
 * Discard every cached query.
 *
 * Must run on sign-in and sign-out. Cached entries are keyed by resource, not by
 * user, so without this the next account inherits the previous one's `me`,
 * `projects/mine`, earnings and dashboard data — served immediately because
 * they're still inside `staleTime`.
 */
export function clearQueryCache(): void {
  _client?.clear();
}
