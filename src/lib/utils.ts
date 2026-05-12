import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ErrorLike = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readErrorLike(err: unknown): ErrorLike | null {
  if (!isObject(err)) return null;
  return {
    message: err.message,
    code: (err as Record<string, unknown>).code,
    details: (err as Record<string, unknown>).details,
    hint: (err as Record<string, unknown>).hint,
  };
}

export function getUserFacingErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) {
    return getUserFacingErrorMessage({ message: err.message }, fallback);
  }
  const e = readErrorLike(err);
  const msg = typeof e?.message === "string" ? e.message : "";
  const code = typeof e?.code === "string" ? e.code : "";
  const details = typeof e?.details === "string" ? e.details : "";
  const hint = typeof e?.hint === "string" ? e.hint : "";
  const combined = [msg, details, hint].filter(Boolean).join(" · ");

  if (
    code === "42501" ||
    /row-level security|permission denied|insufficient privilege|not allowed|access denied/i.test(
      combined,
    )
  ) {
    return "You don’t have permission to do this.";
  }
  if (code === "23505" || /duplicate key value|already exists/i.test(combined)) {
    return "This record already exists.";
  }
  if (code === "23503" || /violates foreign key constraint/i.test(combined)) {
    return "This record is linked to other data and cannot be changed.";
  }
  if (code === "23514" || /violates check constraint/i.test(combined)) {
    if (/payments_kind_fk_check/i.test(combined)) {
      return "Cannot record payment. Please make sure the land has an owner and try again.";
    }
    return "Some values are invalid. Please review and try again.";
  }
  if (code === "23502" || /null value in column/i.test(combined)) {
    return "Please fill all required fields.";
  }
  if (/JWT expired|invalid JWT|Auth session missing/i.test(combined)) {
    return "Your session has expired. Please sign in again.";
  }
  if (/Edge Function returned a non-2xx status code/i.test(combined)) {
    return "Service temporarily unavailable. Please try again.";
  }

  if (msg.trim()) return msg;
  return fallback;
}
