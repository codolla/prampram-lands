import { type ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Map as MapIcon,
  Landmark,
  Receipt,
  CreditCard,
  LogOut,
  ShieldCheck,
  BarChart3,
  MessageSquare,
  UserCog,
  Mail,
  Tags,
  Layers,
  Globe2,
  MapPinned,
  Wallet,
  ScrollText,
} from "lucide-react";
import { useAuth, roleLabel } from "@/lib/auth";
import logoUrl from "@/assets/logo.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const NAV = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "manager", "staff", "frontdesk", "finance"],
  },
  {
    to: "/frontdesk",
    label: "Front Desk",
    icon: UserCog,
    roles: ["admin", "manager", "frontdesk"],
  },
  {
    to: "/landowners",
    label: "Landowners",
    icon: Users,
    roles: ["admin", "manager", "staff", "finance"],
  },
  {
    to: "/lands",
    label: "Lands",
    icon: Landmark,
    roles: ["admin", "manager", "staff", "finance"],
  },
  { to: "/map", label: "Map", icon: MapIcon, roles: ["admin", "manager", "staff"] },
  {
    to: "/land-mapping",
    label: "Land mapping",
    icon: Globe2,
    roles: ["admin", "manager", "staff"],
  },
  {
    to: "/bills",
    label: "Bills",
    icon: Receipt,
    roles: ["admin", "manager", "staff", "finance"],
  },
  { to: "/payments", label: "Payments", icon: CreditCard, roles: ["admin", "manager"] },
  { to: "/payroll", label: "Payroll", icon: Wallet, roles: ["admin", "manager"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "manager"] },
] as const;

const ADMIN_NAV = [
  {
    to: "/settings/system",
    label: "System & Logs",
    icon: ScrollText,
    roles: ["admin", "manager"],
  },
  {
    to: "/settings/users",
    label: "Users & Roles",
    icon: ShieldCheck,
    roles: ["admin"],
  },
  {
    to: "/settings/rent-packages",
    label: "Rent Packages",
    icon: Tags,
    roles: ["admin"],
  },
  {
    to: "/settings/land-types",
    label: "Land Types",
    icon: Layers,
    roles: ["admin"],
  },
  {
    to: "/settings/zones",
    label: "Staff Zones",
    icon: MapPinned,
    roles: ["admin"],
  },
  {
    to: "/settings/sms",
    label: "SMS Settings",
    icon: MessageSquare,
    roles: ["admin"],
  },
  {
    to: "/settings/email",
    label: "Email Domain",
    icon: Mail,
    roles: ["admin"],
  },
] as const;

function AppSidebarInner() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { roles } = useAuth();
  const isDeveloper = roles.includes("developer");
  const canSeeAdminGroup = isDeveloper || roles.includes("admin") || roles.includes("manager");

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const navItems = isDeveloper
    ? [...NAV]
    : NAV.filter((item) => item.roles.some((r) => roles.includes(r)));
  const adminItems = isDeveloper
    ? [...ADMIN_NAV]
    : ADMIN_NAV.filter((item) => item.roles.some((r) => roles.includes(r)));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <div className="flex items-center gap-2.5 px-2 py-3.5">
          <img
            src={logoUrl}
            alt="Prampram Customary Lands Secretariat"
            className="h-10 w-10 shrink-0 rounded-md bg-white/95 object-contain p-1 shadow-sm ring-1 ring-sidebar-border/60"
          />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-serif text-base font-semibold tracking-tight text-sidebar-foreground">
                Prampram
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-sidebar-foreground/65">
                Lands Secretariat
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                    <Link to={item.to} preload="render">
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {canSeeAdminGroup && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                      <Link to={item.to} preload="render">
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}

function UserMenu() {
  const { user, profile, roles, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; phone?: string };
  const phone = profile?.phone ?? meta.phone ?? user?.phone ?? null;
  const email = profile?.email ?? user?.email ?? null;
  const displayName =
    profile?.full_name?.trim() || meta.full_name?.trim() || phone || email || "User";
  const avatarUrl = profile?.avatar_url ?? null;
  const initials = (displayName || email || "U")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase();
  const primaryRole = roles[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-sidebar-foreground hover:bg-sidebar-accent">
          <Avatar className="h-8 w-8 ring-1 ring-sidebar-border/50">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-[11px] font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-1 flex-col overflow-hidden leading-tight">
              <span className="truncate text-xs font-semibold">{displayName}</span>
              <span className="truncate text-[11px] text-sidebar-foreground/70">
                {primaryRole ? roleLabel(primaryRole) : "No role"}
              </span>
            </div>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">
          <div className="font-semibold">{displayName}</div>
          {phone && <div className="text-muted-foreground">{phone}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings/profile">
            <UserCog className="mr-2 h-4 w-4" />
            My profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebarInner />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-5 backdrop-blur-md md:px-8">
            <SidebarTrigger className="-ml-1" />
            <div className="flex items-baseline gap-2">
              <h1 className="font-serif text-xl font-semibold tracking-tight">
                {title ?? "Customary Lands Secretariat"}
              </h1>
            </div>
            <div className="ml-auto flex items-center gap-2">{actions}</div>
          </header>
          <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export { Button };
