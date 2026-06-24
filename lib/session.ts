import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { findUserById, findUserByEmail } from "./db";
import type { User } from "./types";

// Resolve the signed-in DB user from the server session (App Router server components/routes).
export async function getCurrentUser(): Promise<User | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  const id = (session?.user as any)?.id as string | undefined;
  if (id) {
    const byId = await findUserById(id);
    if (byId) return byId;
  }
  if (email) return await findUserByEmail(email);
  return null;
}
