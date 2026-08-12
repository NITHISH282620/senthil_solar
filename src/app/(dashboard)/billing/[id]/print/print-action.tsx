"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintAction() {
  // Automatically trigger print dialog on mount
  useEffect(() => {
    // Add a slight delay to ensure fonts/styles are loaded
    const timeout = setTimeout(() => {
      window.print();
    }, 500);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="print:hidden fixed top-4 right-4 z-50 bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-lg border">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-muted-foreground mb-2 max-w-[200px]">
          Use your browser&apos;s &ldquo;Save as PDF&rdquo; option for the best
          result.
        </p>
        <Button onClick={() => window.print()} className="w-full">
          <Printer className="mr-2 h-4 w-4" />
          Print / Save PDF
        </Button>
        <Button variant="ghost" size="sm" onClick={() => window.close()} className="mt-2 w-full">
          Close Window
        </Button>
      </div>
    </div>
  );
}
