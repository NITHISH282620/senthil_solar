"use client";

import { useState } from "react";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { checkIn, checkOut } from "@/actions/attendance";
import type { Attendance } from "@/types/database";

interface CheckInOutButtonProps {
  todayRecord: Pick<Attendance, "check_in" | "check_out"> | null;
}

export function CheckInOutButton({ todayRecord }: CheckInOutButtonProps) {
  const [loading, setLoading] = useState(false);

  const hasCheckedIn = !!todayRecord?.check_in;
  const hasCheckedOut = !!todayRecord?.check_out;

  const handleAction = async () => {
    setLoading(true);
    try {
      if (!hasCheckedIn) {
        // In a real app, you might ask for navigator.geolocation here
        const result = await checkIn();
        if (result.error) toast.error(result.error);
        else toast.success("Checked in successfully!");
      } else if (!hasCheckedOut) {
        const result = await checkOut();
        if (result.error) toast.error(result.error);
        else toast.success("Checked out successfully!");
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (hasCheckedIn && hasCheckedOut) {
    return (
      <Button disabled variant="outline" className="w-full sm:w-auto">
        <LogOut className="mr-2 h-4 w-4" />
        Checked Out
      </Button>
    );
  }

  return (
    <Button 
      onClick={handleAction} 
      disabled={loading}
      className={`w-full sm:w-auto ${!hasCheckedIn ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : !hasCheckedIn ? (
        <LogIn className="mr-2 h-4 w-4" />
      ) : (
        <LogOut className="mr-2 h-4 w-4" />
      )}
      {!hasCheckedIn ? "Check In Now" : "Check Out"}
    </Button>
  );
}
