import { Skeleton } from "@/components/ui/skeleton";

/**
 * Renders a skeleton table with the given column count and row count.
 * Mimics the shape of a typical table while data loads.
 */
export function TableSkeleton({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/70">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="pb-3 text-left">
                <Skeleton className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-border/40 last:border-0">
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c} className="py-3">
                  <Skeleton className="h-4" style={{ width: `${50 + ((r * 7 + c * 13) % 40)}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A list of stacked rows (e.g. payments-on-bill, log entries). */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center justify-between py-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-4 w-16" />
        </li>
      ))}
    </ul>
  );
}

/** A simple stack of skeleton form rows (label + input). */
export function FormSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Card-shaped skeleton block for stat cards / detail panels. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${60 + ((i * 17) % 35)}%` }} />
      ))}
    </div>
  );
}

/** Receipt / invoice-shaped skeleton (centered logo + grid + total). */
export function ReceiptSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-md border border-border bg-card p-8">
      <div className="flex flex-col items-center gap-3 border-b pb-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-4 py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
