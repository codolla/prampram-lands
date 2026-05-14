import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.loading && !auth.isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [auth.loading, auth.isAuthenticated, navigate]);

  if (auth.loading || !auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background bg-noise">
        <img src={logoUrl} alt="" className="h-12 w-12 object-contain opacity-90" />
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Preparing your workspace
        </p>
      </div>
    );
  }

  return <Outlet />;
}
