"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { warmUpApi } from "@/lib/api/client";
import { registerQueryClient } from "@/lib/query-client";
import { isAxiosError } from "axios";

export function Providers({ children }: { children: React.ReactNode }) {
  // Start waking the backend immediately on load. On free hosting the instance
  // sleeps when idle, and a cold boot outlasts most users' patience if it only
  // begins when they submit a form.
  useEffect(() => {
    warmUpApi();
  }, []);

  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
          retry: (failureCount, error) => {
            if (isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 404)) return false;
            return failureCount < 2;
          },
        },
      },
    });
    // Let the auth store reach this instance so it can clear the cache when the
    // signed-in user changes.
    registerQueryClient(client);
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        // Light is the canonical theme — the warm-paper look is the brand.
        // Dark is a supported alternative, not the default.
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        {process.env.NODE_ENV === "development" && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
