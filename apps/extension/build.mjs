import { build, context } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// node build.mjs [--watch] [--target=firefox]
const watch = process.argv.includes("--watch");
const firefox = process.argv.includes("--target=firefox");
const out = firefox ? "dist-firefox" : "dist";

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync("static", out, { recursive: true });

if (firefox) {
  // Firefox MV3: event-page background (no service_worker), add-on id, Android support (data_collection_permissions needs 142+)
  const m = JSON.parse(readFileSync("static/manifest.json", "utf8"));
  m.background = { scripts: ["background.js"] };
  m.browser_specific_settings = {
    gecko: { id: "jobpilot-autofill@jobpilot.app", strict_min_version: "142.0", data_collection_permissions: { required: ["personallyIdentifyingInfo", "websiteContent"] } },
    gecko_android: { strict_min_version: "142.0" },
  };
  delete m.commands; // no keyboard shortcuts on Android
  writeFileSync(`${out}/manifest.json`, JSON.stringify(m, null, 2));
}

const options = {
  entryPoints: ["src/background.ts", "src/content.ts", "src/main.ts", "src/popup.ts"],
  outdir: out,
  bundle: true,
  format: "iife",
  target: firefox ? "firefox128" : "chrome120",
  logLevel: "info",
};
if (watch) await (await context(options)).watch();
else await build(options);
