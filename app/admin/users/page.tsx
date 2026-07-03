import { listUsersWithGmail, listAllApplications } from "@/lib/db";
import AdminUserRow from "@/components/admin/AdminUserRow";

export default async function AdminUsers() {
  const [users, apps] = await Promise.all([listUsersWithGmail(), listAllApplications(10000)]);
  const countByUser = apps.reduce<Record<string, number>>((m, a) => ((m[a.userId] = (m[a.userId] || 0) + 1), m), {});
  const gmailCount = users.filter((u) => u.gmailAddress).length;

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <h1>Users</h1>
        <p className="text-secondary">{users.length} total · {gmailCount} Gmail connected</p>
      </header>
      <div className="stack gap-3">
        {users.map((u) => (
          <AdminUserRow
            key={u.id}
            id={u.id}
            email={u.email}
            name={u.name}
            plan={u.plan}
            createdAt={u.createdAt}
            applications={countByUser[u.id] || 0}
            gmailAddress={u.gmailAddress}
          />
        ))}
        {users.length === 0 && <div className="glass card text-secondary">No users yet.</div>}
      </div>
    </div>
  );
}
