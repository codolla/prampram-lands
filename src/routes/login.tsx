import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Phone, Lock, ArrowRight, ShieldCheck } from "lucide-react";
import logoUrl from "@/assets/logo.png";
import heroUrl from "@/assets/login-hero.jpg";
import { resolveIdentifier, looksLikePhone } from "@/lib/phone-auth";
import { CONTACT_LINE } from "@/lib/contact";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!auth.loading && auth.isAuthenticated) {
      navigate({ to: "/" });
    }
  }, [auth.loading, auth.isAuthenticated, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      toast.error("Enter your phone number");
      return;
    }
    setSubmitting(true);
    const { email } = resolveIdentifier(identifier);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(
          looksLikePhone(identifier)
            ? "Phone number or password is incorrect"
            : error.message,
        );
        return;
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not sign in. Check your connection and try again.",
      );
      return;
    } finally {
      setSubmitting(false);
    }
    toast.success("Welcome back");
    navigate({ to: "/" });
  };

  return (
    <div className="grid min-h-screen w-full bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Hero panel */}
      <aside className="relative hidden overflow-hidden lg:block">
        <img
          src={heroUrl}
          alt="Aerial view of Prampram lands at golden hour"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-sidebar/85 via-sidebar/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-sidebar/90 via-transparent to-transparent" />

        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-sidebar-foreground">
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt=""
              className="h-11 w-11 rounded-md bg-white/95 object-contain p-1 shadow-lg"
            />
            <div className="leading-tight">
              <p className="font-serif text-lg font-semibold">Prampram</p>
              <p className="text-xs text-sidebar-foreground/75">
                Customary Lands Secretariat
              </p>
            </div>
          </div>

          <div className="max-w-lg space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-sidebar-foreground/20 bg-sidebar-foreground/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/85 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Land Records · Est. Tradition
            </span>
            <h2 className="font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-balance xl:text-5xl">
              Stewarding the lands of Prampram for the next generation.
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-sidebar-foreground/80">
              A single, trusted register for landowners, parcels, ground rent
              billing and payments — managed by the Secretariat with care.
            </p>
          </div>

          <div className="flex items-center justify-between text-xs text-sidebar-foreground/70">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              Secured access · Authorised personnel only
            </span>
            <span>{CONTACT_LINE}</span>
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex items-center justify-center bg-noise px-6 py-10 sm:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <img src={logoUrl} alt="" className="h-10 w-10 object-contain" />
            <div className="leading-tight">
              <p className="font-serif text-base font-semibold">Prampram</p>
              <p className="text-xs text-muted-foreground">
                Customary Lands Secretariat
              </p>
            </div>
          </div>

          <div className="mb-8 space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
              Welcome back
            </p>
            <h1 className="font-serif text-4xl font-semibold tracking-tight text-balance">
              Sign in to your workspace
            </h1>
            <p className="text-sm text-muted-foreground">
              Use your registered phone number and password to continue.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Phone number
              </Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="identifier"
                  type="text"
                  inputMode="tel"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="0244 123 456"
                  className="h-12 pl-10 text-base"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Existing email accounts can still sign in by typing the email here.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Password
                </Label>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-12 pl-10 text-base"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="group h-12 w-full text-base shadow-editorial"
              disabled={submitting}
            >
              {submitting ? "Signing in…" : "Sign in"}
              <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Accounts are issued by the Secretariat administrator. Contact your
              administrator if you need access.
            </p>
          </form>

          <p className="mt-12 text-center text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} Prampram Customary Lands Secretariat
          </p>
        </div>
      </main>
    </div>
  );
}
