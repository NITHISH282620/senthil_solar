"use client";

import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-provider";
import type { Proposal } from "@/lib/ai/types";

interface ConfirmationCardProps {
  proposal: Proposal;
  onConfirm: (proposal: Proposal) => Promise<void>;
  onReject: (proposal: Proposal) => Promise<void>;
}

/**
 * The one screen every financial mutation the agent proposes must pass
 * through. Nothing here is editable — the summary is exactly what the
 * server resolved and will execute verbatim if confirmed, so there is no
 * gap between what the owner reads and what gets written.
 */
export function ConfirmationCard({ proposal, onConfirm, onReject }: ConfirmationCardProps) {
  const { t } = useLocale();
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
        {t("voiceAgent.confirmTitle")}
      </p>
      <p className="text-sm leading-relaxed">{proposal.summary}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("confirm");
            await onConfirm(proposal);
            setBusy(null);
          }}
        >
          {busy === "confirm" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          )}
          {t("voiceAgent.confirm")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("reject");
            await onReject(proposal);
            setBusy(null);
          }}
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          {t("voiceAgent.cancel")}
        </Button>
      </div>
    </div>
  );
}
