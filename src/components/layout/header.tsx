"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import type { Profile } from "@/types/database";

// Map routes to readable page titles
const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/employees": "Employees",
  "/attendance": "Attendance",
  "/companies": "Client Companies",
  "/contracts": "Contracts",
  "/sites": "Sites",
  "/cash": "Cash Book",
  "/payroll": "Payroll",
  "/quotations": "Quotations",
  "/billing": "Billing",
  "/expenses": "Expenses",
  "/documents": "Documents",
  "/reports": "Reports",
  "/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  // Direct match
  if (routeTitles[pathname]) return routeTitles[pathname];

  // Check if it's a nested route
  for (const [route, title] of Object.entries(routeTitles)) {
    if (pathname.startsWith(route)) {
      // Handle /employees/new, /employees/[id]/edit, etc.
      if (pathname.endsWith("/new")) return `New ${title.replace(/s$/, "")}`;
      if (pathname.endsWith("/edit")) return `Edit ${title.replace(/s$/, "")}`;
      return `${title} Detail`;
    }
  }

  return "SolarOps";
}

interface HeaderProps {
  user: Profile;
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur-sm px-4 lg:px-6">
      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="lg:hidden" />
          }
        >
          <Menu size={20} />
          <span className="sr-only">Toggle menu</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <Sidebar user={user} />
        </SheetContent>
      </Sheet>

      {/* Page title */}
      <div className="flex-1">
        <h1 className="text-lg font-semibold tracking-tight">{pageTitle}</h1>
      </div>

      {/* Right section — can add notifications, search later */}
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline-block text-sm text-muted-foreground">
          {user.full_name}
        </span>
      </div>
    </header>
  );
}
