"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Briefcase,
  IndianRupee,
  Receipt,
  Building2,
  FileText,
  Settings,
  Sun,
  LogOut,
  ChevronLeft,
  Wallet,
  HardHat,
  Banknote,
  ShieldCheck,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { logoutAction } from "@/actions/auth";

interface SidebarProps {
  user: Profile;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  roles?: string[]; // If empty, all roles can see
}

const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    title: "Clients",
    href: "/companies",
    icon: Building2,
    roles: ["owner", "manager"],
  },
  {
    title: "Quotations",
    href: "/quotations",
    icon: FileText,
    roles: ["owner", "manager"],
  },
  { title: "Contracts", href: "/contracts", icon: Briefcase },
  { title: "Sites", href: "/sites", icon: HardHat },
  {
    title: "Cash Book",
    href: "/cash",
    icon: Wallet,
    roles: ["owner", "manager", "accountant"],
  },
  {
    title: "Attendance",
    href: "/attendance",
    icon: CalendarCheck,
    roles: ["owner", "manager", "supervisor", "engineer"],
  },
  {
    title: "My Attendance",
    href: "/attendance/my-attendance",
    icon: CalendarCheck,
    roles: ["worker", "store_manager", "accountant"],
  },
  { title: "Expenses", href: "/expenses", icon: Receipt },
  {
    title: "Billing",
    href: "/billing",
    icon: IndianRupee,
    roles: ["owner", "manager"],
  },
  {
    title: "Employees",
    href: "/employees",
    icon: Users,
    roles: ["owner", "manager"],
  },
  {
    title: "Payroll",
    href: "/payroll",
    icon: Banknote,
    roles: ["owner", "manager", "accountant"],
  },
];

const bottomItems: NavItem[] = [
  { title: "Audit Trail", href: "/audit", icon: ShieldCheck, roles: ["owner"] },
  { title: "Settings", href: "/settings", icon: Settings, roles: ["owner"] },
];

export function Sidebar({ user, collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();

  const filteredNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );

  const filteredBottomItems = bottomItems.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );

  const initials = user.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shrink-0">
          <Sun size={20} />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight">Sentil Solar</span>
        )}
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className={cn(
              "ml-auto h-7 w-7 shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground",
              collapsed && "ml-0 rotate-180"
            )}
          >
            <ChevronLeft size={16} />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {filteredNavItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger render={<span />}>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">{item.title}</TooltipContent>
                </Tooltip>
              );
            }

            return <div key={item.href}>{linkContent}</div>;
          })}
        </nav>
      </ScrollArea>

      {/* Bottom section */}
      <div className="px-3 pb-3 space-y-1">
        {filteredBottomItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          const linkContent = (
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger render={<span />}>{linkContent}</TooltipTrigger>
                <TooltipContent side="right">{item.title}</TooltipContent>
              </Tooltip>
            );
          }

          return <div key={item.href}>{linkContent}</div>;
        })}

        <Separator className="my-2" />

        {/* User profile */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5",
            collapsed && "justify-center px-0"
          )}
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.full_name}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">
                {user.role}
              </p>
            </div>
          )}
          {!collapsed && (
            <form action={logoutAction}>
              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground"
                  >
                    <LogOut size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sign out</TooltipContent>
              </Tooltip>
            </form>
          )}
        </div>
      </div>
    </aside>
  );
}
