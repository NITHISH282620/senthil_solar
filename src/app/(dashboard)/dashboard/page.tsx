import {
  Users,
  UserRoundSearch,
  Wrench,
  IndianRupee,
  CalendarCheck,
  Receipt,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { getCurrentUser } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  // Fetch counts based on role
  const isAdminOrManager =
    user.role === "admin" || user.role === "manager";

  // Employee count (admin/manager only)
  let employeeCount = 0;
  if (isAdminOrManager) {
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);
    employeeCount = count ?? 0;
  }

  // Greeting based on time of day
  const hour = new Date().getHours();
  let greeting = "Good morning";
  if (hour >= 12 && hour < 17) greeting = "Good afternoon";
  else if (hour >= 17) greeting = "Good evening";

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 p-6 sm:p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-2xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4 blur-xl" />
        <div className="relative z-10">
          <h1 className="text-2xl sm:text-3xl font-bold">
            {greeting}, {user.full_name.split(" ")[0]}! ☀️
          </h1>
          <p className="text-white/80 mt-2 max-w-lg">
            {isAdminOrManager
              ? "Here's an overview of your solar operations. Manage your team, track work orders, and monitor performance."
              : "Here's your daily summary. Check your work orders and update your progress."}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      {isAdminOrManager ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Active Employees"
            value={employeeCount}
            icon={Users}
            description="Currently active team members"
          />
          <StatCard
            title="Customers"
            value="—"
            icon={UserRoundSearch}
            description="Total customers"
            iconColor="text-blue-600"
          />
          <StatCard
            title="Active Work Orders"
            value="—"
            icon={Wrench}
            description="In progress"
            iconColor="text-emerald-600"
          />
          <StatCard
            title="Revenue"
            value="—"
            icon={IndianRupee}
            description="This month"
            iconColor="text-purple-600"
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="My Work Orders"
            value="—"
            icon={Wrench}
            description="Assigned to you"
          />
          <StatCard
            title="Attendance"
            value="—"
            icon={CalendarCheck}
            description="This month"
            iconColor="text-emerald-600"
          />
          <StatCard
            title="My Expenses"
            value="—"
            icon={Receipt}
            description="Pending approval"
            iconColor="text-blue-600"
          />
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-lg p-3 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
              <Clock size={24} className="text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold">Mark Attendance</h3>
              <p className="text-sm text-muted-foreground">
                Check in for today
              </p>
            </div>
          </CardContent>
        </Card>

        {isAdminOrManager && (
          <>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="rounded-lg p-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
                  <UserRoundSearch size={24} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Add Customer</h3>
                  <p className="text-sm text-muted-foreground">
                    Register a new customer
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="rounded-lg p-3 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30">
                  <TrendingUp size={24} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold">View Reports</h3>
                  <p className="text-sm text-muted-foreground">
                    Analytics and insights
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
