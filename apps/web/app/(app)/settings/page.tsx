import { getUser, requireUserId } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui";
import { InstallApp, NotificationsToggle } from "@/components/pwa";
import { env } from "@/lib/env";
import { ExtensionToken } from "./token";
import { FollowUpDefaults } from "./followup-defaults";
import { canSend } from "@/lib/followup/service";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const user = await getUser(userId);
  return (
    <>
      <PageHeader title="Settings" description="Browser extension and account." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2 xl:items-start">
        <Card>
          <h2 className="font-semibold">Chrome extension</h2>
          <p className="mb-4 mt-1 text-sm text-fg-muted">
            Autofills application forms from your profile, attaches your resume, learns new answers, and logs applications.
          </p>
          <ExtensionToken active={!!user?.extTokenHash} />
        </Card>
        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Follow-up emails</h2>
            <p className="mt-1 text-sm text-fg-muted">
              {canSend(user?.googleScopes) ? "Gmail send permission: granted ✓" : "Gmail send permission: not granted yet. Sign out and back in once to allow sending follow-ups."}
            </p>
          </div>
          <FollowUpDefaults on={user?.followUpDefaultOn ?? true} days={user?.followUpDefaultDays ?? 7} max={user?.followUpDefaultMax ?? 2} />
        </Card>
        <Card className="space-y-4">
          <div>
            <h2 className="font-semibold">Phone app</h2>
            <p className="mt-1 text-sm text-fg-muted">Install JobPilot on your Android home screen. Share job links from LinkedIn or Naukri to it, and copy saved answers on the go.</p>
          </div>
          <InstallApp />
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-sm font-medium">Notifications</p>
            <p className="mb-3 text-sm text-fg-muted">Get notified when Gmail sync finds an assessment, interview, offer or rejection.</p>
            <NotificationsToggle publicKey={env().NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
          </div>
        </Card>
        <Card>
          <h2 className="font-semibold">Install the extension</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            <li>Open <code className="rounded bg-muted px-1">chrome://extensions</code> and turn on <b>Developer mode</b> (top right).</li>
            <li>Click <b>Load unpacked</b> and choose the folder <code className="break-all rounded bg-muted px-1">~/projects/jobpilot/apps/extension/dist</code>.</li>
            <li>Pin JobPilot from the puzzle-piece menu, click it, and paste your token.</li>
            <li>On any application form, click the JobPilot icon → <b>Autofill this page</b>. Green outline = filled, yellow = required but not filled, blue = from a saved answer (check it).</li>
            <li>When you submit, new answers are saved to your profile and the job moves to <b>Jobs → Applied</b>. You can also click <b>Save answers &amp; mark applied</b> in the popup.</li>
          </ol>
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-sm font-medium">On your Android phone (Firefox)</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
              <li>Install <b>Firefox</b> from the Play Store and open this page in it.</li>
              <li>
                Tap <a href="/downloads/jobpilot-autofill.xpi" className="font-medium text-accent hover:underline">Download the Firefox add-on</a>. If Firefox offers to install it, tap <b>Add</b>.
              </li>
              <li>Otherwise: Firefox → Settings → About Firefox → tap the logo 5 times → back to Settings → <b>Install add-on from file</b> → pick the downloaded file.</li>
              <li>Open the add-on from Firefox&apos;s ⋮ menu → Extensions → JobPilot, and paste your token.</li>
            </ol>
          </div>
          <p className="mt-4 text-xs text-fg-muted">Signed in as {user?.email}. The extension only runs on a tab when you click it.</p>
        </Card>
      </div>
    </>
  );
}
