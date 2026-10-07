import { count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { preflight, unauthorized, userFromToken, withCors } from "@/lib/ext/auth";

async function handle(req: Request) {
  const user = await userFromToken(req);
  if (!user) return unauthorized();
  const [{ n }] = await db().select({ n: count() }).from(schema.profileFields).where(eq(schema.profileFields.userId, user.id));
  return Response.json({ email: user.email, name: user.name, profileFields: n });
}

export const GET = withCors(handle);
export const OPTIONS = preflight;
