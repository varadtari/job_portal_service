// Signs the Firefox build as an UNLISTED (private) add-on via the addons.mozilla.org API and downloads the .xpi.
// `web-ext sign` fails with "Unknown JWT iss" for this account, while the API itself accepts the same key.
//
// Usage: AMO_KEY=user:… AMO_SECRET=… node scripts/amo-sign.mjs
//   (bump "version" in static/manifest.json first: AMO rejects re-uploading an existing version)
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const ISS = process.env.AMO_KEY, SECRET = process.env.AMO_SECRET, API = "https://addons.mozilla.org/api/v5";
const jwt = () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "HS256", typ: "JWT" }), b = b64({ iss: ISS, jti: crypto.randomUUID(), iat: now, exp: now + 120 });
  return `JWT ${h}.${b}.${crypto.createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url")}`;
};
const api = async (path, init = {}) => {
  const r = await fetch(path.startsWith("http") ? path : API + path, { ...init, headers: { Authorization: jwt(), ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!ISS || !SECRET) throw new Error("Set AMO_KEY and AMO_SECRET");
execSync("node build.mjs --target=firefox", { stdio: "inherit" });
rmSync("jobpilot-firefox.zip", { force: true });
execSync("cd dist-firefox && zip -qr ../jobpilot-firefox.zip .");
const form = new FormData();
form.append("upload", new Blob([readFileSync("jobpilot-firefox.zip")]), "jobpilot-firefox.zip");
form.append("channel", "unlisted");
const upload = await api("/addons/upload/", { method: "POST", body: form });
if (upload.status >= 300) throw new Error(`Upload failed: ${JSON.stringify(upload.json)}`);
const uuid = upload.json.uuid;
const GUID = JSON.parse(readFileSync("dist-firefox/manifest.json", "utf8")).browser_specific_settings.gecko.id;

// 1. Validation
let up;
for (let i = 0; i < 60; i++) {
  up = (await api(`/addons/upload/${uuid}/`)).json;
  if (up.processed) break;
  await sleep(5000);
}
console.log("validation:", up.valid ? "passed" : "FAILED", JSON.stringify(up.validation?.messages?.filter((m) => m.type === "error").map((m) => m.message) ?? []));
if (!up.valid) process.exit(1);

// 2. Create the unlisted add-on from this upload
const exists = (await api(`/addons/addon/${encodeURIComponent(GUID)}/`)).status === 200;
const created = exists
  ? await api(`/addons/addon/${encodeURIComponent(GUID)}/versions/`, { method: "POST", body: JSON.stringify({ upload: uuid }) })
  : await api(`/addons/addon/`, { method: "POST", body: JSON.stringify({ version: { upload: uuid } }) });
console.log(exists ? "new version:" : "create add-on:", created.status);
if (created.status >= 300) throw new Error(JSON.stringify(created.json).slice(0, 300));
const guid = GUID;
const versionId = exists ? created.json.id : (created.json.latest_unlisted_version?.id ?? created.json.current_version?.id ?? created.json.version?.id);

// 3. Wait for signing
let v;
for (let i = 0; i < 90; i++) {
  v = (await api(`/addons/addon/${encodeURIComponent(guid)}/versions/${versionId}/`)).json;
  if (v.file?.status === "public" && v.file?.url) break;
  await sleep(10000);
}
console.log("file status:", v.file?.status);
if (v.file?.status !== "public") process.exit(1);

// 4. Download
const r = await fetch(v.file.url, { headers: { Authorization: jwt() } });
const buf = Buffer.from(await r.arrayBuffer());
mkdirSync("signed", { recursive: true });
const out = `signed/jobpilot_autofill-${v.version}.xpi`;
writeFileSync(out, buf);
console.log("saved:", out, buf.length, "bytes");
