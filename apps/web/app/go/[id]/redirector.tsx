"use client";

import { useEffect } from "react";

/** Short pause so the extension sees this page's URL, then the same tab goes to the posting. */
export function Redirector({ url }: { url: string }) {
  useEffect(() => {
    const t = setTimeout(() => window.location.replace(url), 400);
    return () => clearTimeout(t);
  }, [url]);
  return null;
}
