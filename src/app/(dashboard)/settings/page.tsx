import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { getCompanySettings } from "@/actions/settings";
import { SettingsForm } from "@/components/forms/settings-form";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: settings } = await getCompanySettings();

  if (!settings) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" />
        <p className="text-muted-foreground">
          Company settings not found. Please ensure the database migrations have
          been run.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your company information and system configuration"
      />
      <SettingsForm settings={settings} />
    </div>
  );
}
