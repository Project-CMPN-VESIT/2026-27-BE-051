import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-4 text-muted-foreground">
          <Compass className="w-6 h-6" />
        </div>
        <p className="text-4xl font-bold mb-1">404</p>
        <h1 className="text-lg font-semibold mb-1">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-6">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button asChild><Link href="/">Go home</Link></Button>
          <Button variant="outline" asChild><Link href="/projects">Explore projects</Link></Button>
        </div>
      </div>
    </div>
  );
}
