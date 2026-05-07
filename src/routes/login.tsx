import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Phone, Lock, ArrowRight, ShieldCheck } from "lucide-react";
import logoUrl from "@/assets/logo.png";
import heroUrl from "@/assets/login-hero.jpg";
import { resolveIdentifier, looksLikePhone, normalisePhone } from "@/lib/phone-auth";
import { CONTACT_LINE } from "@/lib/contact";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useServerFn } from "@tanstack/react-start";
import { requestLoginOtp, verifyLoginOtp } from "@/lib/login-otp.functions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [method, setMethod] = useState<"password" | "otp">("otp");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [otpPhone, setOtpPhone] = useState("");
  const [otpStage, setOtpStage] = useState<"phone" | "code">("phone");
  const [otpCode, setOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const verifyingRef = useRef(false);

  const requestOtp = useServerFn(requestLoginOtp);
  const verifyOtp = useServerFn(verifyLoginOtp);

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
          looksLikePhone(identifier) ? "Phone number or password is incorrect" : error.message,
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

  const sendOtp = useCallback(async () => {
    const phone = otpPhone.trim();
    if (!phone) {
      toast.error("Enter your phone number");
      return;
    }
    setSendingOtp(true);
    try {
      const r = await requestOtp({ data: { phone } });
      if (!r.ok) throw new Error(r.error ?? "Could not send code");
      toast.success("OTP sent", { description: `We sent a code to ${normalisePhone(phone)}.` });
      setOtpStage("code");
      setOtpCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setSendingOtp(false);
    }
  }, [otpPhone, requestOtp]);

  const confirmOtp = useCallback(
    async (rawCode: string) => {
      if (verifyingRef.current) return;
      const phone = otpPhone.trim();
      const code = rawCode.trim().replace(/[^\d]/g, "");
      if (!phone) {
        toast.error("Enter your phone number");
        return;
      }
      if (code.length !== 6) {
        toast.error("Enter the 6-digit code");
        return;
      }
      verifyingRef.current = true;
      setVerifyingOtp(true);
      try {
        const r = await verifyOtp({ data: { phone, code } });
        if (!r.ok || !r.session) throw new Error(r.error ?? "Could not verify code");
        const { error } = await supabase.auth.setSession(r.session);
        if (error) throw error;
        toast.success("Welcome back");
        navigate({ to: "/" });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not verify code");
      } finally {
        verifyingRef.current = false;
        setVerifyingOtp(false);
      }
    },
    [navigate, otpPhone, verifyOtp],
  );

  useEffect(() => {
    if (method !== "otp") return;
    if (otpStage !== "code") return;
    const digits = otpCode.replace(/[^\d]/g, "");
    if (digits.length !== 6) return;
    if (verifyingRef.current) return;
    void confirmOtp(digits);
  }, [confirmOtp, method, otpCode, otpStage]);

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
              <p className="text-xs text-sidebar-foreground/75">Customary Lands Secretariat</p>
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
              A single, trusted register for landowners, parcels, ground rent billing and payments —
              managed by the Secretariat with care.
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
              <p className="text-xs text-muted-foreground">Customary Lands Secretariat</p>
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
              Use your registered phone number to sign in with a password or a one-time code.
            </p>
          </div>

          <Tabs
            value={method}
            onValueChange={(v) => {
              const m = v === "otp" ? "otp" : "password";
              setMethod(m);
              if (m === "password") {
                setOtpStage("phone");
                setOtpCode("");
              }
            }}
            className="space-y-5"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="password">Password</TabsTrigger>
              <TabsTrigger value="otp">OTP</TabsTrigger>
            </TabsList>

            <TabsContent value="password" className="mt-0">
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="identifier"
                    className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
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
                  <Label
                    htmlFor="password"
                    className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Password
                  </Label>
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
              </form>
            </TabsContent>

            <TabsContent value="otp" className="mt-0">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="otp-phone"
                    className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Phone number
                  </Label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="otp-phone"
                      type="text"
                      inputMode="tel"
                      value={otpPhone}
                      onChange={(e) => setOtpPhone(e.target.value)}
                      autoComplete="tel"
                      placeholder="0244 123 456"
                      className="h-12 pl-10 text-base"
                      disabled={otpStage === "code"}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    We will send a 6-digit code to your phone.
                  </p>
                </div>

                {otpStage === "phone" ? (
                  <Button
                    type="button"
                    className="h-12 w-full text-base shadow-editorial"
                    onClick={sendOtp}
                    disabled={sendingOtp}
                  >
                    {sendingOtp ? "Sending…" : "Send OTP"}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Enter OTP</p>
                          <p className="text-xs text-muted-foreground">
                            Sent to {normalisePhone(otpPhone.trim())}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setOtpStage("phone");
                            setOtpCode("");
                          }}
                        >
                          Change
                        </Button>
                      </div>
                      <div className="mt-4 flex items-center justify-center">
                        <InputOTP
                          maxLength={6}
                          value={otpCode}
                          onChange={setOtpCode}
                          disabled={verifyingOtp}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 text-base"
                        onClick={sendOtp}
                        disabled={sendingOtp || verifyingOtp}
                      >
                        {sendingOtp ? "Resending…" : "Resend OTP"}
                      </Button>
                      <Button
                        type="button"
                        className="h-12 text-base shadow-editorial"
                        onClick={() => confirmOtp(otpCode)}
                        disabled={verifyingOtp || otpCode.replace(/[^\d]/g, "").length !== 6}
                      >
                        {verifyingOtp ? "Verifying…" : "Verify & sign in"}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Accounts are issued by the Secretariat administrator. Contact your administrator if you
            need access.
          </p>

          <p className="mt-12 text-center text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} Prampram Customary Lands Secretariat
          </p>
        </div>
      </main>
    </div>
  );
}
