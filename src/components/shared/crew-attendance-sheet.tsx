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
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getCrewForDate, markCrewAttendance, type CrewMember } from "@/actions/attendance";
import type { SiteOption } from "@/actions/sites";

/**
 * The sheet a supervisor fills in standing on site.
 *
 * Deliberately one tap per person and one submit for the crew: markCrewAttendance
 * existed as an action with nothing to call it, and before that there was no way
 * for a supervisor to record anyone's day but their own — so attendance stayed on
 * paper and payroll had nothing to read.
 */
const CHOICES = [
  { value: "present", label: "P", title: "Present", tone: "bg-emerald-600 text-white" },
  { value: "half_day", label: "½", title: "Half day", tone: "bg-amber-500 text-white" },
  { value: "absent", label: "A", title: "Absent", tone: "bg-red-600 text-white" },
  { value: "leave", label: "L", title: "Leave", tone: "bg-blue-600 text-white" },
];

export function CrewAttendanceSheet({
  sites,
  today,
}: {
  sites: SiteOption[];
  today: string;
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [crew, setCrew] = useState<CrewMember[] | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
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
      setMarks(
        Object.fromEntries(
          (data ?? [])
            .filter((m) => m.status)
            .map((m) => [m.employee_id, m.status as string])
        )
      );
    });
  }

  async function handleSave() {
    const entries = Object.entries(marks).map(([employee_id, status]) => ({
      employee_id,
      status,
    }));

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

  const markedCount = Object.keys(marks).length;

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
              {crew.map((member) => (
                <div
                  key={member.employee_id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{member.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.employee_code} · {member.role_on_site}
                    </p>
                  </div>

                  <div className="flex gap-1">
                    {CHOICES.map((choice) => {
                      const active = marks[member.employee_id] === choice.value;
                      return (
                        <button
                          key={choice.value}
                          type="button"
                          title={choice.title}
                          aria-label={`${member.full_name}: ${choice.title}`}
                          aria-pressed={active}
                          onClick={() =>
                            setMarks((m) => ({ ...m, [member.employee_id]: choice.value }))
                          }
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
              ))}
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
