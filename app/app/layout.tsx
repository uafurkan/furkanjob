import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getProfile } from "@/lib/db";
import AppNav from "@/components/nav/AppNav";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const profile = await getProfile(user.id);
  if (!profile?.completedAt) redirect("/onboarding");

  return (
    <div className="app-shell">
      <AppNav name={user.name} plan={user.plan} />
      <main className="app-main container">{children}</main>
    </div>
  );
}
