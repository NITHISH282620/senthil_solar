"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replaced by structured logging / Sentry in the observability phase.
    console.error("Dashboard route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This page could not be loaded. The problem has been logged. You can
          retry, or head back to the dashboard.
        </p>
        {error.digest && (
          <p className="pt-2 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" render={<Link href="/dashboard" />}>
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
