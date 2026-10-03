import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

const ERRORS: Record<string, string> = {
  AccessDenied: "This Google account isn't on the allowlist.",
  Configuration: "Sign-in is misconfigured. Check the server env vars.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  if ((await auth())?.user) redirect("/dashboard");
  const { error } = await props.searchParams;
  const message = typeof error === "string" ? (ERRORS[error] ?? "Sign-in failed. Try again.") : null;

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-accent font-bold text-accent-fg">J</div>
          <span className="text-lg font-semibold">JobPilot</span>
        </div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Gmail read-only access is requested so application statuses can update automatically.
        </p>
        {message && (
          <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {message}
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
