import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { findUserById, findUserByEmail } from "./db";
import { isAdmin } from "./admin";
import type { User } from "./types";

// Resolve the signed-in DB user from the server session (App Router server components/routes).
// Admin users (Google OAuth + ADMIN_EMAILS/ADMIN_DOMAINS env match) get plan="pro" so all
// limit and gating checks see them as unlimited without any DB change.
export async function getCurrentUser(): Promise<User | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  const provider = (session?.user as any)?.provider as string | undefined;
  const id = (session?.user as any)?.id as string | undefined;

  let user: User | null = null;
  if (id) user = await findUserById(id);
  if (!user && email) user = await findUserByEmail(email);
  if (!user) return null;

  // Grant unlimited access to admins — only via Google OAuth, never demo.
  if (isAdmin(email, provider) && user.plan !== "pro") {
    return { ...user, plan: "pro" };
  }
  return user;
}
