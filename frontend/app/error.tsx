"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface to the console (and Sentry, if wired on the client later).
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold mb-1">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-6">
          An unexpected error occurred. You can try again, or head back home.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="outline" asChild><Link href="/">Go home</Link></Button>
        </div>
        {error?.digest && (
          <p className="text-[11px] text-muted-foreground mt-4">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
