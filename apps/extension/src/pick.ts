// Option picking used in both the isolated content script and the page ("MAIN") world helper.

const YES = /^(yes|y|true|i am|i do|i will|i have)\b/i;
const NO = /^(no|n|false|i am not|i do not|i don.t|i will not)\b/i;

/** Index of the best option for `value`, or -1. Mirrors the server's pickOption for options only visible in the page. */
export function pickIndex(value: string, options: string[]): number {
  const v = value.trim().toLowerCase();
  const opts = options.map((o) => o.trim().toLowerCase());
  let i = opts.indexOf(v);
  if (i >= 0) return i;
  if (YES.test(v) || NO.test(v)) {
    i = opts.findIndex((o) => (YES.test(v) ? YES.test(o) && !NO.test(o) : NO.test(o)));
    if (i >= 0) return i;
  }
  i = opts.findIndex((o) => o.startsWith(v) || (v.length > 2 && o.length > 2 && v.startsWith(o)));
  if (i >= 0) return i;
  return opts.findIndex((o) => v.length > 2 && o.includes(v));
}
