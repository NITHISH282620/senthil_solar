import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { getAttendance } from "@/actions/attendance";
import { getCurrentUser } from "@/actions/auth";
import { formatDate } from "@/lib/format";
import { Clock, Calendar, CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Team Attendance",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "manager";
  
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">You do not have access to this page.</p>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const dateParam = typeof resolvedParams.date === "string" ? resolvedParams.date : today;

  const [{ data: attendanceData }] = await Promise.all([
    getAttendance({ date: dateParam }),
  ]);

  const presentCount = attendanceData?.filter(a => a.status === "present" || a.status === "half_day").length || 0;
  const absentCount = attendanceData?.filter(a => a.status === "absent").length || 0;
  const leaveCount = attendanceData?.filter(a => a.status === "leave" || a.status === "holiday").length || 0;

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Team Attendance" 
        description={`Attendance records for ${formatDate(dateParam, "EEEE, dd MMM yyyy")}`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{attendanceData?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Present</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{presentCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Absent</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{absentCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">On Leave</CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{leaveCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Check In</th>
                <th className="px-4 py-3 font-medium">Check Out</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {attendanceData?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No attendance records for this date.
                  </td>
                </tr>
              ) : (
                attendanceData?.map((record) => (
                  <tr key={record.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex flex-col">
                        <span>{record.employee?.full_name}</span>
                        <span className="text-xs text-muted-foreground">{record.employee?.employee_id}</span>
                      </div>
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
                    <td className="px-4 py-3 text-muted-foreground">
                      {record.notes || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
