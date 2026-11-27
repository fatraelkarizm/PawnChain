import { ExternalLink } from "lucide-react";
import type { ComparableReference } from "@/types/pawn";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/** Only live listings get a link; sample data is labelled as such. */
export function AppraisalSources({ references }: { references: ComparableReference[] }) {
  if (references.length === 0) {
    return <p className="text-xs text-[var(--ink-muted)]">No market references available.</p>;
  }
  return (
    <ul className="space-y-1">
      {references.map((ref, i) => (
        <li key={i} className="flex items-center justify-between gap-2 text-xs">
          {ref.sourceType === "firecrawl_live" && ref.url ? (
            <a
              href={ref.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-[65%] items-center gap-1 truncate text-[var(--accent-vault)] hover:underline"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{ref.source}</span>
            </a>
          ) : (
            <span className="truncate text-amber-800">Sample reference · Sandbox only</span>
          )}
          <span className="font-mono text-[11px] tabular-nums text-[var(--ink-primary)]">
            {idr.format(ref.priceIdr)}
          </span>
        </li>
      ))}
    </ul>
  );
}
