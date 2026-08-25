import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { getCompanySettings } from "@/actions/settings";
import { SettingsForm } from "@/components/forms/settings-form";
import { BankAccounts } from "@/components/shared/bank-accounts";
import { getBankAccounts } from "@/actions/bank-accounts";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== "owner") {
    redirect("/dashboard");
  }

  const [{ data: settings }, { data: bankAccounts }] = await Promise.all([
    getCompanySettings(),
    getBankAccounts(),
  ]);

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
      <BankAccounts accounts={bankAccounts ?? []} />
    </div>
  );
}
