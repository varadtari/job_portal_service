import { env } from "@/lib/env";

// Minimal Supabase Storage REST client (server-only; uses the secret key).
const BUCKET = "resumes";

function cfg() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase Storage is not configured");
  return {
    base: `${SUPABASE_URL}/storage/v1`,
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  };
}

let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const { base, headers } = cfg();
  const res = await fetch(`${base}/bucket`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  // 400/409 = already exists
  if (!res.ok && res.status !== 400 && res.status !== 409) {
    throw new Error(`Storage bucket setup failed: ${res.status} ${await res.text()}`);
  }
  bucketReady = true;
}

export async function putObject(path: string, body: Uint8Array, contentType: string) {
  await ensureBucket();
  const { base, headers } = cfg();
  const res = await fetch(`${base}/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": contentType, "x-upsert": "true" },
    body: Buffer.from(body),
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
}

export async function signedUrl(path: string, expiresIn = 300): Promise<string> {
  const { base, headers } = cfg();
  const res = await fetch(`${base}/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) throw new Error(`Signing failed: ${res.status}`);
  const { signedURL } = (await res.json()) as { signedURL: string };
  return `${base}${signedURL}`;
}

export async function removeObject(path: string) {
  const { base, headers } = cfg();
  await fetch(`${base}/object/${BUCKET}`, {
    method: "DELETE",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] }),
  });
}
