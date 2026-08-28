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
import { useLocale } from "@/lib/i18n/locale-provider";
import type { TranslationKey } from "@/lib/i18n";

// Map routes to their nav translation key (mirrors sidebar.tsx's navItems).
// Client Companies uses nav.clients like the sidebar link it corresponds to.
const routeTitleKeys: Record<string, TranslationKey> = {
  "/dashboard": "nav.dashboard",
  "/employees": "nav.employees",
  "/attendance": "nav.attendance",
  "/companies": "nav.clients",
  "/contracts": "nav.contracts",
  "/sites": "nav.sites",
  "/cash": "nav.cashBook",
  "/payroll": "nav.payroll",
  "/quotations": "nav.quotations",
  "/billing": "nav.billing",
  "/settings": "nav.settings",
};

function getPageTitle(
  pathname: string,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string {
  // Direct match
  if (routeTitleKeys[pathname]) return t(routeTitleKeys[pathname]);

  // Check if it's a nested route
  for (const [route, key] of Object.entries(routeTitleKeys)) {
    if (pathname.startsWith(route)) {
      const title = t(key);
      // Handle /employees/new, /employees/[id]/edit, etc.
      if (pathname.endsWith("/new"))
        return t("common.newItem", { item: title.replace(/s$/, "") });
      if (pathname.endsWith("/edit"))
        return t("common.editItem", { item: title.replace(/s$/, "") });
      return t("common.itemDetail", { item: title });
    }
  }

  return t("common.appName");
}

interface HeaderProps {
  user: Profile;
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const { t } = useLocale();
  const pageTitle = getPageTitle(pathname, t);

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
          <span className="sr-only">{t("nav.toggleMenu")}</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">{t("nav.navigationMenu")}</SheetTitle>
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
