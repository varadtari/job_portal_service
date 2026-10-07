import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "JobPilot",
    short_name: "JobPilot",
    description: "Your job search copilot: jobs, tailored resumes, autofill answers and application tracking.",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c0c0e",
    theme_color: "#4f46e5",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Jobs", url: "/jobs", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Applications", url: "/applications", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Quick answers", url: "/answers", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    // Android: "Share → JobPilot" from LinkedIn, Naukri, Chrome… adds the job
    share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
  } as MetadataRoute.Manifest;
}
