import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { encrypt } from "@/lib/crypto";
import { isAllowed, normalizeEmail, parseAllowlist } from "@/lib/allowlist";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
// Send is only used for follow-ups the user reviews and sends themselves
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Google({
      authorization: {
        params: {
          scope: `openid email profile ${GMAIL_SCOPE} ${GMAIL_SEND_SCOPE}`,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email;
      if (!email || profile?.email_verified === false) return false;
      const rows = await db().select({ email: schema.allowedEmails.email }).from(schema.allowedEmails);
      return isAllowed(email, parseAllowlist(env().ALLOWED_EMAILS), rows.map((r) => r.email));
    },
    async jwt({ token, account, profile }) {
      // Only runs with account/profile on the initial sign-in.
      if (account && profile?.email) {
        const email = normalizeEmail(profile.email);
        const refresh = account.refresh_token
          ? encrypt(account.refresh_token, env().TOKEN_ENC_KEY)
          : undefined;
        const [user] = await db()
          .insert(schema.users)
          .values({
            email,
            name: profile.name ?? null,
            image: (profile.picture as string | undefined) ?? null,
            googleRefreshTokenEnc: refresh ?? null,
            googleScopes: account.scope ?? null,
          })
          .onConflictDoUpdate({
            target: schema.users.email,
            set: {
              name: profile.name ?? null,
              image: (profile.picture as string | undefined) ?? null,
              ...(refresh ? { googleRefreshTokenEnc: refresh, gmailNeedsReconnect: false } : {}),
              ...(account.scope ? { googleScopes: account.scope } : {}),
            },
          })
          .returning({ id: schema.users.id });
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});

/** Returns the signed-in user's id or throws. Use in server components/actions/route handlers. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) throw new Response("Unauthorized", { status: 401 });
  return uid;
}

export async function getUser(uid: string) {
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, uid));
  return u;
}
