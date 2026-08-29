"use client";

import { useState } from "react";
import { Mic } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useLocale } from "@/lib/i18n/locale-provider";
import { VoiceAgentPanel } from "./voice-agent-panel";
import type { Profile } from "@/types/database";

/**
 * Owner-only, deliberately. Every server route behind this also checks the
 * role — this gate is about not showing a Worker a button that would only
 * ever answer "the voice assistant is available to the owner only", not
 * about being the security boundary itself.
 */
export function VoiceAgentLauncher({ user }: { user: Profile }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  if (user.role !== "owner") return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label={t("voiceAgent.launcherLabel")}
            className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 print:hidden"
          />
        }
      >
        <Mic size={24} />
      </SheetTrigger>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md">
        <SheetTitle className="border-b px-4 py-3 text-base">{t("voiceAgent.title")}</SheetTitle>
        <VoiceAgentPanel />
      </SheetContent>
    </Sheet>
  );
}
