import { Calendar, Clock, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { getAttendance } from "@/actions/attendance";
import { getCurrentUser } from "@/actions/auth";
import { formatDate } from "@/lib/format";
import type { Metadata } from "next";
import { CheckInOutButton } from "./check-in-out-button";

export const metadata: Metadata = {
  title: "My Attendance",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MyAttendancePage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  
  // Default to current month if no month provided
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const month = typeof resolvedParams.month === "string" ? resolvedParams.month : currentMonth;

  const [currentUser, { data: attendanceData }] = await Promise.all([
    getCurrentUser(),
    getAttendance({ month }), // fetch current month by default
  ]);

  // Check if they checked in today
  const today = new Date().toISOString().split("T")[0];
  const todayRecord = attendanceData?.find(a => a.date === today);

  const presentDays = attendanceData?.filter(a => a.status === "present" || a.status === "half_day").length || 0;
  const leaveDays = attendanceData?.filter(a => a.status === "leave" || a.status === "holiday").length || 0;
  const absentDays = attendanceData?.filter(a => a.status === "absent").length || 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <PageHeader 
          title="My Attendance" 
          description="View your attendance history and check in/out."
        />
        
        <div className="flex-shrink-0">
          <CheckInOutButton todayRecord={todayRecord ?? null} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-emerald-600">{presentDays}</span>
            <span className="text-sm text-muted-foreground mt-1">Days Present</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-blue-600">{leaveDays}</span>
            <span className="text-sm text-muted-foreground mt-1">Leaves / Holidays</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-destructive">{absentDays}</span>
            <span className="text-sm text-muted-foreground mt-1">Days Absent</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              Attendance History ({month})
            </CardTitle>
            
            {/* Simple month selector could go here, for now it relies on URL query */}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Check In</th>
                  <th className="px-4 py-3 font-medium">Check Out</th>
                  <th className="px-4 py-3 font-medium text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {attendanceData?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No attendance records found for this month.
                    </td>
                  </tr>
                ) : (
                  attendanceData?.map((record) => {
                    let hoursStr = "—";
                    if (record.check_in && record.check_out) {
                      const diff = new Date(record.check_out).getTime() - new Date(record.check_in).getTime();
                      const hours = Math.floor(diff / (1000 * 60 * 60));
                      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                      hoursStr = `${hours}h ${minutes}m`;
                    }
                    
                    return (
                      <tr key={record.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">
                          {formatDate(record.date, "E, dd MMM yyyy")}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={record.status} />
                        </td>
                        <td className="px-4 py-3">
                          {record.check_in ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              {formatDate(record.check_in, "HH:mm")}
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {record.check_out ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              {formatDate(record.check_out, "HH:mm")}
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {hoursStr}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
