import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/require-auth";

/** Editing a listing requires a session; ownership is enforced server-side. */
export default function EditProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <RequireAuth>{children}</RequireAuth>
    </Suspense>
  );
}
