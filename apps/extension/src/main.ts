import { pickIndex } from "./pick";

// Runs in the page's own JS world ("MAIN"), where React internals are visible. Custom dropdowns like
// react-select ignore synthetic clicks, so we call the component's own selectOption(), as a real click would.

type SelectInstance = {
  selectOption: (o: unknown) => void;
  getOptionLabel?: (o: unknown) => string;
  props: { options?: unknown[] };
};

const W = window as unknown as { __jobpilotMain?: boolean };

if (!W.__jobpilotMain) {
  W.__jobpilotMain = true;

  function findSelect(el: Element): SelectInstance | null {
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
    let fiber = key ? (el as unknown as Record<string, { return?: unknown; stateNode?: unknown }>)[key] : undefined;
    for (let i = 0; fiber && i < 60; i++) {
      const node = fiber.stateNode as SelectInstance | null;
      if (node && typeof node.selectOption === "function") return node;
      fiber = fiber.return as typeof fiber;
    }
    return null;
  }

  document.addEventListener("jobpilot:select", (e) => {
    const { req, id, value } = JSON.parse((e as CustomEvent<string>).detail) as { req: string; id: string; value: string };
    let ok = false;
    let label: string | null = null;
    try {
      const el = document.querySelector(`[data-jp-id="${id}"]`);
      const inst = el && findSelect(el);
      if (inst) {
        const flat = (inst.props.options ?? []).flatMap((o) => ((o as { options?: unknown[] }).options ?? [o]));
        const labelOf = (o: unknown) => String(inst.getOptionLabel ? inst.getOptionLabel(o) : (o as { label?: string }).label ?? "");
        const idx = pickIndex(value, flat.map(labelOf));
        if (idx >= 0) {
          inst.selectOption(flat[idx]);
          ok = true;
          label = labelOf(flat[idx]);
        }
      }
    } catch {
      ok = false;
    }
    document.dispatchEvent(new CustomEvent("jobpilot:select:done", { detail: JSON.stringify({ req, ok, label }) }));
  });
}
