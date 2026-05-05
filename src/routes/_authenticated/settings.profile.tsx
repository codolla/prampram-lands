import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2, Save, KeyRound } from "lucide-react";
import { AvatarUpload } from "@/components/AvatarUpload";
import { FormSkeleton } from "@/components/skeletons";

/** Hide synthetic phone-auth emails from the UI. */
function isSyntheticEmail(value: string | null | undefined): boolean {
  return !!value && value.endsWith("@phone.local");
}

export const Route = createFileRoute("/_authenticated/settings/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (profile.data) {
      setFullName(profile.data.full_name ?? "");
      setPhone(profile.data.phone ?? "");
      const e = profile.data.email ?? user?.email ?? "";
      setEmail(isSyntheticEmail(e) ? "" : e);
      setAvatarUrl(profile.data.avatar_url ?? null);
    }
  }, [profile.data, user?.email]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          avatar_url: avatarUrl,
        })
        .eq("id", user.id);
      if (pErr) throw pErr;

      if (email.trim() && email.trim() !== user.email) {
        // Only attempt to change the auth email when it's a real address,
        // not when the user is filling in their email for the first time
        // alongside a phone-based account (phone stays the identifier).
        if (!isSyntheticEmail(user.email)) {
          const { error: eErr } = await supabase.auth.updateUser({
            email: email.trim(),
          });
          if (eErr) throw eErr;
        } else {
          // Just store the email in the profile for contact purposes.
          await supabase.from("profiles").update({ email: email.trim() }).eq("id", user.id);
        }
      }
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      void refreshProfile();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const updatePassword = useMutation({
    mutationFn: async () => {
      if (newPassword.length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match");
      }
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password updated");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="My Profile">
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile information</CardTitle>
            <CardDescription>Update your name, contact details and email address.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.isLoading ? (
              <FormSkeleton rows={4} />
            ) : (
              <>
                <AvatarUpload
                  value={avatarUrl}
                  onChange={setAvatarUrl}
                  folder="users"
                  entityId={user?.id}
                  fallback={fullName || email || "U"}
                  size={96}
                />
                <div className="grid gap-2">
                  <Label htmlFor="full_name">Full name</Label>
                  <Input
                    id="full_name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Kojo Mensah"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 0244123456"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="optional"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional — for receipts and notifications. Your phone number is your sign-in
                    identifier.
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
                    {saveProfile.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save changes
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change password</CardTitle>
            <CardDescription>Use a strong password of at least 8 characters.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="new_password">New password</Label>
              <Input
                id="new_password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm_password">Confirm new password</Label>
              <Input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Separator />
            <div className="flex justify-end">
              <Button
                onClick={() => updatePassword.mutate()}
                disabled={updatePassword.isPending || !newPassword || !confirmPassword}
              >
                {updatePassword.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Update password
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
