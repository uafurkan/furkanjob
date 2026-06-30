import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { upsertUserByEmail, upsertGoogleAccount, findUserById, setUserPlan, proEmails } from "./db";
import { encrypt } from "./crypto";

const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!GOOGLE_ID || !GOOGLE_SECRET) {
  console.warn("[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — sign-in will not work.");
}

export const authOptions: NextAuthOptions = {
  providers: GOOGLE_ID && GOOGLE_SECRET ? [
    GoogleProvider({
      clientId: GOOGLE_ID,
      clientSecret: GOOGLE_SECRET,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.send",
          access_type: "offline",
          prompt: "consent", // force refresh_token on every consent
        },
      },
    }),
  ] : [],
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      const email =
        (profile as any)?.email || (user as any)?.email || (token.email as string | undefined);
      if ((account || user) && email) {
        const dbUser = await upsertUserByEmail({
          email,
          name: (profile as any)?.name || (user as any)?.name,
          image: (profile as any)?.picture || (user as any)?.image,
        });
        (token as any).userId = dbUser.id;
        (token as any).plan = dbUser.plan;
        token.email = email;
        token.name = dbUser.name || token.name;
        token.picture = dbUser.image || token.picture;

        if (account?.provider === "google" && account.access_token) {
          await upsertGoogleAccount({
            userId: dbUser.id,
            address: email,
            accessToken: encrypt(account.access_token),
            refreshToken: encrypt(account.refresh_token),
            expiresAt: typeof account.expires_at === "number" ? account.expires_at : null,
            scope: account.scope,
          });
          (token as any).gmailConnected = true;
        }
        // Store the auth provider for downstream checks.
        if (account?.provider) (token as any).provider = account.provider;
      }
      // keep plan fresh; auto-upgrade PRO_EMAILS accounts without requiring sign-out
      if ((token as any).userId) {
        const u = await findUserById((token as any).userId);
        if (u) {
          if (u.plan === "free" && u.email && proEmails().includes(u.email.toLowerCase())) {
            await setUserPlan(u.id, "pro");
            (token as any).plan = "pro";
          } else {
            (token as any).plan = u.plan;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).userId;
        (session.user as any).plan = (token as any).plan || "free";
        (session.user as any).gmailConnected = (token as any).gmailConnected || false;
        (session.user as any).provider = (token as any).provider || "google";
      }
      return session;
    },
  },
};

export const googleEnabled = Boolean(GOOGLE_ID && GOOGLE_SECRET);
// Google OAuth is the only sign-in method; googleEnabled is kept so the
// signin page can show a useful error when env keys are missing.
