import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendOverdueReminders } from "@/lib/sms.functions";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ListSkeleton } from "@/components/skeletons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Save, Send } from "lucide-react";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings/sms")({
  component: SmsSettingsPage,
});

type SettingsForm = {
  sms_provider: "arkesel" | "hubtel" | "mnotify";
  sms_sender_id: string;
  reminder_template: string;
  reminder_cooldown_days: number;
  arkesel_api_key: string;
  hubtel_client_id: string;
  hubtel_client_secret: string;
  mnotify_api_key: string;
};

const DEFAULT: SettingsForm = {
  sms_provider: "arkesel",
  sms_sender_id: "PLS",
  reminder_template:
    "Dear {owner}, your land rate bill {bill} of GHS {amount} for {year} is overdue. Please pay to avoid penalties. Thank you.",
  reminder_cooldown_days: 7,
  arkesel_api_key: "",
  hubtel_client_id: "",
  hubtel_client_secret: "",
  mnotify_api_key: "",
};

function SmsSettingsPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const send = useServerFn(sendOverdueReminders);
  const [form, setForm] = useState<SettingsForm>(DEFAULT);
  const [rowId, setRowId] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");

  const settings = useQuery({
    queryKey: ["app_settings"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings.data) {
      setRowId(settings.data.id);
      setForm({
        sms_provider: (settings.data.sms_provider ?? "arkesel") as SettingsForm["sms_provider"],
        sms_sender_id: settings.data.sms_sender_id ?? "PLS",
        reminder_template: settings.data.reminder_template ?? DEFAULT.reminder_template,
        reminder_cooldown_days: settings.data.reminder_cooldown_days ?? 7,
        arkesel_api_key: settings.data.arkesel_api_key ?? "",
        hubtel_client_id: settings.data.hubtel_client_id ?? "",
        hubtel_client_secret: settings.data.hubtel_client_secret ?? "",
        mnotify_api_key: settings.data.mnotify_api_key ?? "",
      });
    }
  }, [settings.data]);

  const logs = useQuery({
    queryKey: ["sms_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_logs")
        .select("id, phone, provider, status, created_at, message")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!rowId) throw new Error("Settings row not loaded yet.");
      const { error } = await supabase
        .from("app_settings")
        .update(form)
        .eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["app_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: async () => {
      const r = await send({ data: { testPhone } });
      if (!r.ok) throw new Error(r.error ?? "Test failed");
      return r;
    },
    onSuccess: () => {
      toast.success("Test SMS dispatched");
      qc.invalidateQueries({ queryKey: ["sms_logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <AppShell title="SMS Settings">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Only administrators can configure SMS settings.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="SMS Settings">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Provider & sender</CardTitle>
              <CardDescription>
                Choose your SMS gateway and the sender ID that appears on
                recipient phones.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Provider</Label>
                  <Select
                    value={form.sms_provider}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        sms_provider: v as SettingsForm["sms_provider"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="arkesel">Arkesel</SelectItem>
                      <SelectItem value="hubtel">Hubtel</SelectItem>
                      <SelectItem value="mnotify">mNotify</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Sender ID</Label>
                  <Input
                    maxLength={11}
                    value={form.sms_sender_id}
                    onChange={(e) =>
                      setForm({ ...form, sms_sender_id: e.target.value })
                    }
                  />
                </div>
              </div>

              {form.sms_provider === "arkesel" && (
                <div className="space-y-1">
                  <Label>Arkesel API key</Label>
                  <Input
                    type="password"
                    placeholder="api-key from arkesel.com"
                    value={form.arkesel_api_key}
                    onChange={(e) =>
                      setForm({ ...form, arkesel_api_key: e.target.value })
                    }
                  />
                </div>
              )}

              {form.sms_provider === "hubtel" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Hubtel Client ID</Label>
                    <Input
                      value={form.hubtel_client_id}
                      onChange={(e) =>
                        setForm({ ...form, hubtel_client_id: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Hubtel Client Secret</Label>
                    <Input
                      type="password"
                      value={form.hubtel_client_secret}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          hubtel_client_secret: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              )}

              {form.sms_provider === "mnotify" && (
                <div className="space-y-1">
                  <Label>mNotify API key</Label>
                  <Input
                    type="password"
                    value={form.mnotify_api_key}
                    onChange={(e) =>
                      setForm({ ...form, mnotify_api_key: e.target.value })
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reminder message</CardTitle>
              <CardDescription>
                Variables: {"{owner}"}, {"{bill}"}, {"{amount}"}, {"{year}"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-1">
                <Label>Template</Label>
                <Textarea
                  rows={4}
                  value={form.reminder_template}
                  onChange={(e) =>
                    setForm({ ...form, reminder_template: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Cooldown (days)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.reminder_cooldown_days}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        reminder_cooldown_days: Number(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Skip bills already reminded within this many days.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  <Save className="mr-1 h-4 w-4" />
                  {save.isPending ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Test SMS</CardTitle>
              <CardDescription>
                Send a test message using the saved configuration.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label>Phone number</Label>
                <Input
                  placeholder="0244000000 or 233244000000"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => test.mutate()}
                disabled={test.isPending || !testPhone}
              >
                <Send className="mr-1 h-4 w-4" />
                {test.isPending ? "Sending…" : "Send test"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Recent SMS log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {logs.isLoading ? (
              <ListSkeleton rows={4} />
            ) : (logs.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              (logs.data ?? []).map((l) => (
                <div
                  key={l.id}
                  className="rounded border border-border p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{l.phone}</span>
                    <span
                      className={
                        l.status === "sent"
                          ? "text-green-600"
                          : "text-destructive"
                      }
                    >
                      {l.status}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {l.provider} · {formatDate(l.created_at)}
                  </div>
                  <div className="mt-1 line-clamp-2 text-foreground/80">
                    {l.message}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}