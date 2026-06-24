import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { upsertUserByEmail, upsertGoogleAccount, findUserById } from "./db";
import { encrypt } from "./crypto";

const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const providers: NextAuthOptions["providers"] = [];

if (GOOGLE_ID && GOOGLE_SECRET) {
  providers.push(
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
    })
  );
}

// Dev / no-Google fallback: sign in with just an email so the whole app is testable.
providers.push(
  CredentialsProvider({
    id: "demo",
    name: "Demo",
    credentials: {
      email: { label: "Email", type: "email" },
      name: { label: "Name", type: "text" },
    },
    async authorize(creds) {
      const email = (creds?.email || "").trim().toLowerCase();
      if (!email) return null;
      return { id: email, email, name: creds?.name || email.split("@")[0] };
    },
  })
);

export const authOptions: NextAuthOptions = {
  providers,
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
      }
      // keep plan fresh
      if ((token as any).userId) {
        const u = await findUserById((token as any).userId);
        if (u) (token as any).plan = u.plan;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).userId;
        (session.user as any).plan = (token as any).plan || "free";
        (session.user as any).gmailConnected = (token as any).gmailConnected || false;
      }
      return session;
    },
  },
};

export const googleEnabled = Boolean(GOOGLE_ID && GOOGLE_SECRET);
