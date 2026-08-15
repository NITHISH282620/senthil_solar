"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Play, Lock } from "lucide-react";
import { toast } from "sonner";
import { generatePayroll, finalisePayroll } from "@/actions/payroll";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function GeneratePayrollForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const now = new Date();
  // Payroll is normally run for the month that just ended.
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [month, setMonth] = useState(String(previous.getMonth() + 1));
  const [year, setYear] = useState(String(previous.getFullYear()));

  const years = [now.getFullYear(), now.getFullYear() - 1].map(String);

  async function handleGenerate() {
    setLoading(true);
    const { data, error } = await generatePayroll(Number(month), Number(year));

    if (error || !data) {
      toast.error(error ?? "Could not generate payroll.");
      setLoading(false);
      return;
    }

    toast.success(`Draft payroll built for ${data.employee_count} employees`);
    router.push(`/payroll/${data.id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={month} onValueChange={(v) => setMonth(v ?? month)}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((m, i) => (
            <SelectItem key={m} value={String(i + 1)}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={year} onValueChange={(v) => setYear(v ?? year)}>
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={y}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button onClick={handleGenerate} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Play className="mr-2 h-4 w-4" />
        )}
        Build draft
      </Button>
    </div>
  );
}

export function FinalisePayrollButton({
  runId,
  status,
}: {
  runId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (status !== "draft") return null;

  async function handleFinalise() {
    setLoading(true);
    const { error } = await finalisePayroll(runId);

    if (error) {
      toast.error(error);
      setLoading(false);
      return;
    }

    toast.success("Payroll finalised. Advances recovered and attendance locked.");
    setConfirming(false);
    setLoading(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          This recovers advances and locks the month&apos;s attendance.
        </span>
        <Button size="sm" onClick={handleFinalise} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Yes, finalise
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={() => setConfirming(true)}>
      <Lock className="mr-2 h-4 w-4" />
      Finalise
    </Button>
  );
}
