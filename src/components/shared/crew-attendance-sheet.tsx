"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { getCrewForDate, markCrewAttendance, type CrewMember } from "@/actions/attendance";
import type { SiteOption } from "@/actions/sites";

/**
 * The sheet a supervisor fills in standing on site.
 *
 * A quick tap sets Present, Half day or Absent. There is no "Leave" tap
 * anymore — leave is a paid absence the owner grants, not something a
 * supervisor can hand out from a phone; it comes through the leave-request
 * workflow instead. Present and Half day both ask for the time actually
 * worked, because "present" alone told the owner nothing he could pay
 * against — a normal 9-to-5 and someone held on site until 9pm looked
 * identical. The hours worked, and any overtime, are computed from that
 * time and shown back immediately as "5hr 45min" rather than a decimal.
 */
const STATUS_CHOICES = [
  { value: "present", label: "P", title: "Present", tone: "bg-emerald-600 text-white" },
  { value: "half_day", label: "½", title: "Half day", tone: "bg-amber-500 text-white" },
  { value: "absent", label: "A", title: "Absent", tone: "bg-red-600 text-white" },
] as const;

type StatusValue = (typeof STATUS_CHOICES)[number]["value"];

const NEEDS_TIME = new Set<StatusValue>(["present", "half_day"]);

/** Minutes since midnight, for diffing two "HH:mm" strings. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function workedHoursBetween(start: string, end: string): number | null {
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a === null || b === null || b <= a) return null;
  return (b - a) / 60;
}

interface TimeRange {
  start: string;
  end: string;
}

export function CrewAttendanceSheet({
  sites,
  today,
  defaultShiftStart = "09:00",
  defaultShiftEnd = "17:00",
}: {
  sites: SiteOption[];
  today: string;
  /** The company's normal shift, used to prefill the time pickers. */
  defaultShiftStart?: string;
  defaultShiftEnd?: string;
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [crew, setCrew] = useState<CrewMember[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, StatusValue>>({});
  const [times, setTimes] = useState<Record<string, TimeRange>>({});
  const [loading, startLoading] = useTransition();
  const [saving, setSaving] = useState(false);

  function load(nextSite = siteId, nextDate = date) {
    if (!nextSite) return;
    startLoading(async () => {
      const { data, error } = await getCrewForDate(nextSite, nextDate);
      if (error) {
        toast.error(error);
        return;
      }
      setCrew(data ?? []);
      // Seed from what is already recorded, so re-opening the sheet shows the
      // day as it stands rather than as a blank form.
      setStatuses(
        Object.fromEntries(
          (data ?? [])
            .filter((m): m is CrewMember & { status: StatusValue } =>
              STATUS_CHOICES.some((c) => c.value === m.status)
            )
            .map((m) => [m.employee_id, m.status])
        )
      );
      setTimes(
        Object.fromEntries(
          (data ?? []).map((m) => [
            m.employee_id,
            {
              start: m.check_in_time ?? defaultShiftStart,
              end: m.check_out_time ?? defaultShiftEnd,
            },
          ])
        )
      );
    });
  }

  function setStatus(employeeId: string, status: StatusValue) {
    setStatuses((s) => ({ ...s, [employeeId]: status }));
    // Give every newly-marked person the normal shift to start from; the
    // supervisor only has to change it for someone who worked different hours.
    setTimes((t) =>
      t[employeeId] ? t : { ...t, [employeeId]: { start: defaultShiftStart, end: defaultShiftEnd } }
    );
  }

  function setTime(employeeId: string, field: "start" | "end", value: string) {
    setTimes((t) => ({
      ...t,
      [employeeId]: { ...(t[employeeId] ?? { start: defaultShiftStart, end: defaultShiftEnd }), [field]: value },
    }));
  }

  async function handleSave() {
    const entries: {
      employee_id: string;
      status: string;
      check_in_time?: string;
      check_out_time?: string;
    }[] = [];

    for (const [employeeId, status] of Object.entries(statuses)) {
      if (NEEDS_TIME.has(status)) {
        const range = times[employeeId];
        if (!range || workedHoursBetween(range.start, range.end) === null) {
          const person = crew?.find((c) => c.employee_id === employeeId);
          toast.error(
            `${person?.full_name ?? "Someone"}: check-out must be after check-in.`
          );
          return;
        }
        entries.push({
          employee_id: employeeId,
          status,
          check_in_time: range.start,
          check_out_time: range.end,
        });
      } else {
        entries.push({ employee_id: employeeId, status });
      }
    }

    if (entries.length === 0) {
      toast.error("Mark at least one person.");
      return;
    }

    setSaving(true);
    const { error } = await markCrewAttendance(siteId, date, entries);
    setSaving(false);

    if (error) toast.error(error);
    else {
      toast.success(`${entries.length} marked for ${date}.`);
      router.refresh();
      load();
    }
  }

  if (sites.length === 0) return null;

  const markedCount = Object.keys(statuses).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mark the crew</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="crew-site">Site</Label>
            <Select
              value={siteId}
              onValueChange={(v) => {
                const next = v ?? siteId;
                setSiteId(next);
                setCrew(null);
                load(next, date);
              }}
            >
              <SelectTrigger id="crew-site" className="w-64">
                <SelectValue placeholder="Choose a site" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="crew-date">Date</Label>
            <Input
              id="crew-date"
              type="date"
              value={date}
              max={today}
              className="w-44"
              onChange={(e) => {
                setDate(e.target.value);
                setCrew(null);
                load(siteId, e.target.value);
              }}
            />
          </div>

          <Button variant="outline" onClick={() => load()} disabled={loading || !siteId}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load crew
          </Button>
        </div>

        {crew !== null && crew.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nobody is assigned to this site yet. Assign the crew on the site page
            first — attendance is recorded against an assignment.
          </p>
        )}

        {crew !== null && crew.length > 0 && (
          <>
            <div className="divide-y rounded-md border">
              {crew.map((member) => {
                const status = statuses[member.employee_id];
                const range = times[member.employee_id];
                const showTime = status && NEEDS_TIME.has(status);
                const duration = range ? workedHoursBetween(range.start, range.end) : null;

                return (
                  <div key={member.employee_id} className="p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{member.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.employee_code} · {member.role_on_site}
                        </p>
                      </div>

                      <div className="flex gap-1">
                        {STATUS_CHOICES.map((choice) => {
                          const active = status === choice.value;
                          return (
                            <button
                              key={choice.value}
                              type="button"
                              title={choice.title}
                              aria-label={`${member.full_name}: ${choice.title}`}
                              aria-pressed={active}
                              onClick={() => setStatus(member.employee_id, choice.value)}
                              className={cn(
                                "h-9 w-9 rounded-md border text-sm font-semibold transition-colors",
                                active ? choice.tone : "hover:bg-muted"
                              )}
                            >
                              {choice.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {showTime && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-muted/40 p-2.5">
                        <div className="flex items-center gap-1.5">
                          <Label htmlFor={`start-${member.employee_id}`} className="text-xs text-muted-foreground">
                            From
                          </Label>
                          <Input
                            id={`start-${member.employee_id}`}
                            type="time"
                            value={range?.start ?? defaultShiftStart}
                            onChange={(e) => setTime(member.employee_id, "start", e.target.value)}
                            className="h-8 w-28"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Label htmlFor={`end-${member.employee_id}`} className="text-xs text-muted-foreground">
                            To
                          </Label>
                          <Input
                            id={`end-${member.employee_id}`}
                            type="time"
                            value={range?.end ?? defaultShiftEnd}
                            onChange={(e) => setTime(member.employee_id, "end", e.target.value)}
                            className="h-8 w-28"
                          />
                        </div>
                        <div
                          className={cn(
                            "ml-auto flex items-center gap-1 text-sm font-medium",
                            duration === null ? "text-destructive" : "text-foreground"
                          )}
                        >
                          <Clock className="h-3.5 w-3.5" />
                          {duration === null ? "Check-out must be after check-in" : formatDuration(duration)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {markedCount} of {crew.length} marked
              </p>
              <Button onClick={handleSave} disabled={saving || markedCount === 0}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Save the day
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
