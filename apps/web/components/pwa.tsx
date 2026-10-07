"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/ui";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/(app)/settings/push-actions";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const standaloneQuery = "(display-mode: standalone)";
const subscribeStandalone = (cb: () => void) => {
  const mq = window.matchMedia(standaloneQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function InstallApp() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [justInstalled, setInstalled] = useState(false);
  const standalone = useSyncExternalStore(subscribeStandalone, () => window.matchMedia(standaloneQuery).matches, () => false);
  const installed = standalone || justInstalled;
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (installed) return <p className="text-sm text-success">✓ Installed. You&apos;re using the app.</p>;
  if (evt)
    return (
      <Button onClick={async () => { await evt.prompt(); const c = await evt.userChoice; if (c.outcome === "accepted") setInstalled(true); setEvt(null); }}>
        Install JobPilot app
      </Button>
    );
  return <p className="text-sm text-fg-muted">On your Android phone, open this site in Chrome → ⋮ menu → <b>Add to Home screen</b> / <b>Install app</b>.</p>;
}

const urlB64ToUint8Array = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export function NotificationsToggle({ publicKey }: { publicKey: string | undefined }) {
  const [state, setState] = useState<"loading" | "unsupported" | "denied" | "off" | "on">("loading");
  const [msg, setMsg] = useState<string>();
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !publicKey) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })();
  }, [publicKey]);

  const enable = () =>
    start(async () => {
      setMsg(undefined);
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey!) });
      const r = await savePushSubscription(JSON.parse(JSON.stringify(sub)), navigator.userAgent);
      if ("error" in r && r.error) return setMsg(r.error);
      setState("on");
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });

  if (state === "loading") return null;
  if (state === "unsupported") return <p className="text-sm text-fg-muted">This browser doesn&apos;t support notifications. On Android, use Chrome or the installed app.</p>;
  if (state === "denied") return <p className="text-sm text-warning">Notifications are blocked. Allow them in the browser&apos;s site settings, then reload.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "on" ? (
        <>
          <span className="text-sm text-success">✓ On for this device</span>
          <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await sendTestPush(); setMsg(r.sent ? "Test sent." : "No devices received it."); })}>Send test</Button>
          <Button variant="ghost" disabled={pending} onClick={disable}>Turn off</Button>
        </>
      ) : (
        <Button disabled={pending} onClick={enable}>Enable notifications</Button>
      )}
      {msg && <span className="text-sm text-fg-muted">{msg}</span>}
    </div>
  );
}
