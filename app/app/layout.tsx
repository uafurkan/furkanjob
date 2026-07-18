import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getProfile } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import AppNav from "@/components/nav/AppNav";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";

// Private, auth-gated area: keep it out of search indexes (robots.txt alone
// doesn't prevent a disallowed URL from being indexed by reference).
export const metadata = { robots: { index: false, follow: false } };

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const profile = await getProfile(user.id);
  if (!profile?.completedAt) redirect("/onboarding");

  return (
    <div className="app-shell">
      <AppNav name={user.name} plan={user.plan} isAdmin={isAdminEmail(user.email)} />
      <main className="app-main container">{children}</main>
      <KeyboardShortcuts />
    </div>
  );
}
