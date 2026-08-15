"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { checkIn, checkOut } from "@/actions/attendance";
import type { Attendance } from "@/types/database";

interface CheckInOutButtonProps {
  todayRecord: Pick<Attendance, "check_in_at" | "check_out_at"> | null;
  /** Sites this person is assigned to. Attendance is always site-scoped. */
  sites: { id: string; name: string; site_code: string }[];
}

/**
 * Best-effort location. A refused prompt or a phone without GPS must not stop
 * someone marking attendance, so this resolves to null rather than rejecting.
 */
function getCoords(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

export function CheckInOutButton({
  todayRecord,
  sites,
}: CheckInOutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // With a single assignment there is nothing to choose, so preselect it.
  const [siteId, setSiteId] = useState(sites.length === 1 ? sites[0].id : "");

  const hasCheckedIn = !!todayRecord?.check_in_at;
  const hasCheckedOut = !!todayRecord?.check_out_at;

  async function handleAction() {
    setLoading(true);
    try {
      if (!hasCheckedIn) {
        if (!siteId) {
          toast.error("Choose which site you are at.");
          return;
        }
        const coords = await getCoords();
        const result = await checkIn(siteId, coords?.lat, coords?.lng);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Checked in");
      } else if (!hasCheckedOut) {
        const result = await checkOut();
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Checked out");
      }
      router.refresh();
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  if (hasCheckedIn && hasCheckedOut) {
    return (
      <Button disabled variant="outline" className="w-full sm:w-auto">
        <LogOut className="mr-2 h-4 w-4" />
        Checked out
      </Button>
    );
  }

  if (sites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You are not assigned to a site yet. Ask your supervisor to assign you
        before marking attendance.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      {!hasCheckedIn && sites.length > 1 && (
        <Select value={siteId} onValueChange={(v) => setSiteId(v ?? "")}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Which site?" />
          </SelectTrigger>
          <SelectContent>
            {sites.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button
        onClick={handleAction}
        disabled={loading}
        className="w-full sm:w-auto"
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : hasCheckedIn ? (
          <LogOut className="mr-2 h-4 w-4" />
        ) : (
          <LogIn className="mr-2 h-4 w-4" />
        )}
        {hasCheckedIn ? "Check out" : "Check in"}
      </Button>
    </div>
  );
}
