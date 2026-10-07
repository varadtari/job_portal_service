import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Resume uploads are capped at 4 MB; leave room for multipart overhead.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }] },
      // Signed Firefox add-on: the right type lets Firefox offer to install it
      { source: "/downloads/:file*.xpi", headers: [{ key: "Content-Type", value: "application/x-xpinstall" }, { key: "Cache-Control", value: "no-cache" }] },
      // The service worker must never be served stale
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
    ];
  },
  // pdf.js worker files must be traced, not bundled
  serverExternalPackages: ["unpdf"],
  // Fonts are read from disk at runtime by the PDF exporter
  outputFileTracingIncludes: {
    "/api/resumes/[id]/export": ["./lib/export/fonts/**"],
    "/api/ext/resume": ["./lib/export/fonts/**"],
  },
};

export default nextConfig;
