import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ShieldOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account Unavailable",
};

/**
 * Deliberately outside the (dashboard) route group.
 *
 * The dashboard layout calls getCurrentUser(), and getCurrentUser() redirects
 * here when the session has no usable profile. While this page lived inside
 * that group, reaching it re-ran the layout, which redirected here again —
 * ERR_TOO_MANY_REDIRECTS for the one user who most needed to be told what had
 * happened. The page must not depend on the thing it reports the absence of.
 */
export default function UnauthorizedPage() {
  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldOff className="h-6 w-6 text-muted-foreground" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight">
          This account cannot be used
        </h1>

        <p className="text-muted-foreground">
          Your sign-in worked, but the account is not active in Sentil Solar Ops.
          That usually means it has been deactivated, or it was never set up by
          the owner.
        </p>

        <p className="text-sm text-muted-foreground">
          Ask the owner to activate your account, then sign in again.
        </p>

        {/*
          A form, not a link. The sign-out control was a <Link> to a GET route
          handler, and Next prefetches links in the viewport — so simply landing
          on this page signed the user out before they touched anything.
        */}
        <form action={signOut} className="pt-2">
          <Button type="submit">Sign out</Button>
        </form>
      </div>
    </div>
  );
}
