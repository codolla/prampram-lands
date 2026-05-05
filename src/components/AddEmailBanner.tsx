import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Mail, X } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const DISMISS_KEY = "add-email-banner-dismissed";

/**
 * Nudges phone-only users to add a recovery email so password resets work.
 * Hidden once the profile has an email, or when the user dismisses it.
 */
export function AddEmailBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    }
  }, []);

  const profile = useQuery({
    queryKey: ["profile-email", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  if (!user || dismissed || profile.isLoading) return null;

  const stored = profile.data?.email ?? "";
  const hasRealEmail = stored && !stored.endsWith("@phone.local");
  if (hasRealEmail) return null;

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "1");
    }
    setDismissed(true);
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/20 via-accent/10 to-transparent p-4 shadow-editorial sm:flex-nowrap">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/30 text-accent-foreground">
        <Mail className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          Add a recovery email to your account
        </p>
        <p className="text-xs text-muted-foreground">
          So you can reset your password if you ever forget it. We'll only use it
          for security notices.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          to="/settings/profile"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          Add email
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}