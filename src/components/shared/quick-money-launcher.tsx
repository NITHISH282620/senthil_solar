"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { QuickMoneySheet } from "./quick-money-sheet";
import type { SiteOption } from "@/actions/sites";

interface QuickMoneyLauncherProps {
  sites: SiteOption[];
  categories: { code: string; label: string; icon: string | null }[];
  workers: { id: string; full_name: string }[];
  lockedSiteId?: string;
  /** Compact drops the labels down to icons for tight headers. */
  variant?: "full" | "compact";
}

/**
 * The three money buttons the owner actually reaches for, plus the sheet they
 * open. Kept as one client island so server pages stay server-rendered.
 */
export function QuickMoneyLauncher({
  sites,
  categories,
  workers,
  lockedSiteId,
  variant = "full",
}: QuickMoneyLauncherProps) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [category, setCategory] = useState<string | undefined>(undefined);

  function launch(nextDirection: "in" | "out", nextCategory?: string) {
    setDirection(nextDirection);
    setCategory(nextCategory);
    setOpen(true);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size={variant === "compact" ? "sm" : "default"}
          onClick={() => launch("in")}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <ArrowDownLeft className="mr-1.5 h-4 w-4" />
          Money In
        </Button>
        <Button
          size={variant === "compact" ? "sm" : "default"}
          onClick={() => launch("out")}
          variant="destructive"
        >
          <ArrowUpRight className="mr-1.5 h-4 w-4" />
          Money Out
        </Button>
        <Button
          size={variant === "compact" ? "sm" : "default"}
          variant="outline"
          onClick={() => launch("out", "worker_advance")}
        >
          <Wallet className="mr-1.5 h-4 w-4" />
          Advance
        </Button>
      </div>

      <QuickMoneySheet
        open={open}
        onOpenChange={setOpen}
        defaultDirection={direction}
        defaultCategory={category}
        sites={sites}
        categories={categories}
        workers={workers}
        lockedSiteId={lockedSiteId}
      />
    </>
  );
}
