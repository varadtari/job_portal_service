// Funnel: how far each application got, from its status and email history.

const RANK = { applied: 1, oa: 2, interview: 3, offer: 4 } as const;

export type FunnelInput = { status: string; appliedAt: Date | null; eventTypes: string[] };

export function funnel(apps: FunnelInput[]) {
  const stage = (a: FunnelInput) => {
    let r = a.status === "saved" ? 0 : 1; // anything past "saved" was applied
    if (a.status in RANK) r = Math.max(r, RANK[a.status as keyof typeof RANK]);
    for (const t of a.eventTypes) {
      if (t === "oa") r = Math.max(r, 2);
      if (t === "interview") r = Math.max(r, 3);
      if (t === "offer") r = Math.max(r, 4);
    }
    return r;
  };
  const stages = apps.map(stage);
  const reached = (n: number) => stages.filter((s) => s >= n).length;
  const applied = reached(1);
  const responded = apps.filter((a) => a.status !== "saved" && (a.eventTypes.some((t) => t !== "applied_confirm" && t !== "other" && t !== "manual") || ["oa", "interview", "offer", "rejected"].includes(a.status))).length;
  return {
    steps: [
      { label: "Applied", n: applied },
      { label: "Assessment", n: reached(2) },
      { label: "Interview", n: reached(3) },
      { label: "Offer", n: reached(4) },
    ],
    responseRate: applied ? Math.round((responded / applied) * 100) : null,
  };
}
