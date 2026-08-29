"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Send, Camera, Loader2, Bot, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/locale-provider";
import { ConfirmationCard } from "./confirmation-card";
import { useSpeechRecognition, speak } from "./use-speech";
import type { ChatTurn, Proposal } from "@/lib/ai/types";

type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "proposal"; proposal: Proposal; resolved: "confirmed" | "rejected" | null }
  | { kind: "ocr"; fields: OcrFields };

interface OcrFields {
  vendor: string | null;
  date: string | null;
  amount: number | null;
  category_guess: string | null;
  confidence: "high" | "medium" | "low";
}

const speechLang = { en: "en-IN", ta: "ta-IN" } as const;

export function VoiceAgentPanel() {
  const { locale, t } = useLocale();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const sessionIdRef = useRef(crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  const speech = useSpeechRecognition(speechLang[locale]);

  function scrollToBottom() {
    requestAnimationFrame(() => scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  function historyFor(items: ChatItem[]): ChatTurn[] {
    return items
      .filter((i): i is Extract<ChatItem, { kind: "user" | "assistant" }> => i.kind === "user" || i.kind === "assistant")
      .slice(-12)
      .map((i) => ({ role: i.kind, content: i.text }));
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const withUser: ChatItem[] = [...items, { kind: "user", text: trimmed }];
    setItems(withUser);
    setInputValue("");
    setSending(true);
    scrollToBottom();

    try {
      const res = await fetch("/api/agent/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          message: trimmed,
          history: historyFor(items),
          locale,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        const msg = res.status === 503 ? t("voiceAgent.notConfigured") : res.status === 429 ? t("voiceAgent.rateLimited") : json.error || t("voiceAgent.errorGeneric");
        toast.error(msg);
        setItems((cur) => [...cur, { kind: "assistant", text: msg }]);
        return;
      }

      if (json.kind === "proposal") {
        setItems((cur) => [...cur, { kind: "proposal", proposal: json.proposal, resolved: null }]);
      } else {
        const text: string = json.text || "";
        setItems((cur) => [...cur, { kind: "assistant", text }]);
        if (text) speak(text, speechLang[locale]);
      }
    } catch {
      toast.error(t("voiceAgent.errorGeneric"));
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }

  async function handleConfirm(proposal: Proposal) {
    try {
      const res = await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalEventId: proposal.proposalEventId }),
      });
      const json = await res.json();
      const ok = res.ok && json.ok;

      setItems((cur) =>
        cur.map((i) => (i.kind === "proposal" && i.proposal.proposalEventId === proposal.proposalEventId ? { ...i, resolved: "confirmed" } : i))
      );

      if (ok) {
        toast.success(t("voiceAgent.confirmedToast"));
        setItems((cur) => [...cur, { kind: "assistant", text: t("voiceAgent.confirmedToast") }]);
      } else if (res.status === 409) {
        // Already settled by an earlier tap/retry — not a failure the owner needs to act on.
        toast.info(t("voiceAgent.confirmedToast"));
      } else {
        toast.error(json.error || t("voiceAgent.errorGeneric"));
        // Let them try again — the action did not execute.
        setItems((cur) =>
          cur.map((i) => (i.kind === "proposal" && i.proposal.proposalEventId === proposal.proposalEventId ? { ...i, resolved: null } : i))
        );
      }
    } catch {
      toast.error(t("voiceAgent.errorGeneric"));
    }
  }

  async function handleReject(proposal: Proposal) {
    try {
      await fetch("/api/agent/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalEventId: proposal.proposalEventId }),
      });
    } catch {
      // Rejection is best-effort UI state below regardless — nothing was written either way.
    }
    setItems((cur) =>
      cur.map((i) => (i.kind === "proposal" && i.proposal.proposalEventId === proposal.proposalEventId ? { ...i, resolved: "rejected" } : i))
    );
    toast(t("voiceAgent.rejectedToast"));
  }

  function handleMicClick() {
    if (speech.listening) {
      speech.stop();
      return;
    }
    if (!speech.supported) {
      toast.error(t("voiceAgent.speechNotSupported"));
      return;
    }
    speech.start((transcript) => {
      sendMessage(transcript);
    });
  }

  async function handlePhotoSelected(file: File) {
    setOcrBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/agent/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl, locale, sessionId: sessionIdRef.current }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || t("voiceAgent.couldNotReadPhoto"));
        return;
      }

      setItems((cur) => [...cur, { kind: "ocr", fields: json.extracted }]);
      scrollToBottom();
    } catch {
      toast.error(t("voiceAgent.couldNotReadPhoto"));
    } finally {
      setOcrBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-3">
          {items.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("voiceAgent.subtitle")}</p>
          )}
          {items.map((item, idx) => (
            <ChatBubble key={idx} item={item} onConfirm={handleConfirm} onReject={handleReject} onUseOcrFields={sendMessage} />
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("voiceAgent.thinking")}
            </div>
          )}
          <div ref={scrollBottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t p-3 space-y-2">
        {speech.listening && (
          <p className="text-center text-xs font-medium text-primary">{t("voiceAgent.listening")}</p>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotoSelected(file);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={ocrBusy}
            onClick={() => fileInputRef.current?.click()}
            aria-label={t("voiceAgent.photoLabel")}
          >
            {ocrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </Button>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage(inputValue);
            }}
            placeholder={t("voiceAgent.placeholder")}
            disabled={sending}
          />
          <Button
            type="button"
            variant={speech.listening ? "destructive" : "outline"}
            size="icon"
            onClick={handleMicClick}
            aria-label={speech.listening ? t("voiceAgent.stopLabel") : t("voiceAgent.micLabel")}
          >
            {speech.listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button type="button" size="icon" disabled={sending || !inputValue.trim()} onClick={() => sendMessage(inputValue)} aria-label={t("voiceAgent.send")}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  item,
  onConfirm,
  onReject,
  onUseOcrFields,
}: {
  item: ChatItem;
  onConfirm: (p: Proposal) => Promise<void>;
  onReject: (p: Proposal) => Promise<void>;
  onUseOcrFields: (text: string) => void;
}) {
  if (item.kind === "user") {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">{item.text}</div>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
          <UserIcon className="h-3.5 w-3.5" />
        </div>
      </div>
    );
  }

  if (item.kind === "assistant") {
    return (
      <div className="flex gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-3.5 w-3.5" />
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2 text-sm">{item.text}</div>
      </div>
    );
  }

  if (item.kind === "proposal") {
    return (
      <div className={cn("pl-9", item.resolved && "opacity-60")}>
        <ConfirmationCard proposal={item.proposal} onConfirm={onConfirm} onReject={onReject} />
      </div>
    );
  }

  return <OcrReviewCard fields={item.fields} onUseFields={onUseOcrFields} />;
}

/** A separate component (not a branch inside ChatBubble) so its editable-field
 * state hooks are never called conditionally. */
function OcrReviewCard({ fields, onUseFields }: { fields: OcrFields; onUseFields: (text: string) => void }) {
  const { t, locale } = useLocale();
  const [vendor, setVendor] = useState(fields.vendor ?? "");
  const [amount, setAmount] = useState(fields.amount ? String(fields.amount) : "");
  const [date, setDate] = useState(fields.date ?? "");
  const [category, setCategory] = useState(fields.category_guess ?? "");

  return (
    <div className="pl-9">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("voiceAgent.extractedTitle")}</p>
        {fields.confidence === "low" && (
          <p className="text-xs text-amber-600 dark:text-amber-400">{t("voiceAgent.extractedConfidenceLow")}</p>
        )}
        <p className="text-xs text-muted-foreground">{t("voiceAgent.reviewFields")}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("voiceAgent.vendor")}</Label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("voiceAgent.amount")}</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("voiceAgent.date")}</Label>
            <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("voiceAgent.category")}</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={!amount || Number(amount) <= 0}
          onClick={() => {
            const parts = [
              locale === "ta" ? `${category || "செலவு"} செலவு ₹${amount}` : `${category || "an"} expense of ₹${amount}`,
              vendor ? (locale === "ta" ? `${vendor}-க்கு` : `paid to ${vendor}`) : "",
              date ? (locale === "ta" ? `தேதி ${date}` : `on ${date}`) : "",
            ].filter(Boolean);
            onUseFields(parts.join(", "));
          }}
        >
          {t("voiceAgent.useTheseFields")}
        </Button>
      </div>
    </div>
  );
}
