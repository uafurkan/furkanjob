import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";

export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (!isAdminEmail(user.email)) redirect("/app/new");

  return (
    <div className="app-shell">
      <header className="site-header glass">
        <Link href="/admin" className="brand"><span className="brand-dot" /> admin</Link>
        <nav className="topnav">
          <Link href="/admin" className="topnav-item"><span>Overview</span></Link>
          <Link href="/admin/users" className="topnav-item"><span>Users</span></Link>
          <Link href="/admin/applications" className="topnav-item"><span>Applications</span></Link>
          <Link href="/app/new" className="topnav-item"><span>← App</span></Link>
        </nav>
      </header>
      <main className="app-main container" style={{ paddingTop: "var(--space-8)" }}>{children}</main>
    </div>
  );
}
