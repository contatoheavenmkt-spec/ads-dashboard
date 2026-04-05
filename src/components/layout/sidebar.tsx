"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Zap,
  Share2,
  Users,
  LogOut,
  Settings,
  CreditCard,
  BadgeCheck,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { DashfyLogoIcon } from "@/components/logo/logo";

// Custom SVGs from Design System
const ChartIcon = ({ active }: { active?: boolean }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke={active ? "#60a5fa" : "#94a3b8"}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-6 h-6 mb-1 transition-all group-hover:scale-110"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <rect x="8" y="12" width="2" height="5" fill={active ? "#60a5fa" : "none"} rx="0.5" />
    <rect x="12" y="10" width="2" height="7" fill={active ? "#60a5fa" : "none"} rx="0.5" />
    <rect x="16" y="13" width="2" height="4" fill={active ? "#60a5fa" : "none"} rx="0.5" />
  </svg>
);

const GridIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
  </svg>
);

// Ícones de plataforma com imagens reais

const MetaIcon = ({ active = false }: { active?: boolean }) => (
  <img
    src="/icon-meta.png"
    alt="Meta Ads"
    className="w-7 h-7 object-contain transition-all duration-200"
    style={{
      filter: active ? "none" : "grayscale(1) brightness(0.5)",
    }}
  />
);

const GoogleAdsIcon = ({ active = false }: { active?: boolean }) => (
  <img
    src="/icon-google-ads.webp"
    alt="Google Ads"
    className="w-6 h-6 object-contain transition-all duration-200"
    style={{
      filter: active ? "none" : "grayscale(1) brightness(0.5)",
    }}
  />
);

const GA4Icon = ({ active = false }: { active?: boolean }) => (
  <img
    src="/icon-ga4.png"
    alt="Google Analytics 4"
    className="w-6 h-6 object-contain transition-all duration-200"
    style={{
      filter: active ? "none" : "grayscale(1) brightness(0.5)",
    }}
  />
);

interface NavItem {
  href: string;
  label: string;
  icon: any;
  color?: string;
  activeColor?: string;
  platform?: string;
  requiresMulti?: boolean;
  isSvgIcon?: boolean;
}

const saasItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Zap },
  { href: "/integracoes", label: "Contas", icon: Share2 },
  { href: "/workspaces", label: "Workspaces", icon: Users },
  { href: "/dashboard/billing", label: "Plano", icon: BadgeCheck, activeColor: "text-emerald-400" },
];

const allDashboardItems: NavItem[] = [
  { href: "/dashboard", label: "Visão Geral", icon: GridIcon, requiresMulti: true },
  { href: "/dashboard/meta", label: "Meta Ads", icon: MetaIcon, color: "text-slate-500", activeColor: "text-blue-400", platform: "meta" },
  { href: "/dashboard/google", label: "Google Ads", icon: GoogleAdsIcon, color: "text-slate-500", activeColor: "text-cyan-400", platform: "google" },
  { href: "/dashboard/ga4", label: "GA4", icon: GA4Icon, color: "text-orange-400", platform: "ga4" },
  { href: "/dashboard/detalhes", label: "Detalhes", icon: ChartIcon, isSvgIcon: true },
];

interface ConnectionStatus {
  meta: boolean;
  google: boolean;
  ga4: boolean;
  connectedCount: number;
  platforms: string[];
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [connections, setConnections] = useState<ConnectionStatus | null>(null);
  const [onboardingPending, setOnboardingPending] = useState(false);

  const isDashboard = pathname.startsWith("/dashboard");
  const variant = isDashboard ? "dark" : "light";

  useEffect(() => {
    // Fetch connection status when in dashboard
    if (isDashboard) {
      fetch("/api/connections/status")
        .then(r => r.json())
        .then(setConnections)
        .catch(() => null);
    }
    // Fetch onboarding status
    fetch("/api/onboarding/status")
      .then(r => r.json())
      .then(data => {
        if (!data.onboardingCompleted) {
          setOnboardingPending(true);
        }
      })
      .catch(() => null);
  }, [isDashboard]);

  // Mostra TODOS os itens sempre (o usuário pode navegar livremente)
  const dashboardItems = allDashboardItems;

  const currentItems = isDashboard ? dashboardItems : saasItems;

  return (
    <aside className={cn(
      "w-20 lg:w-24 flex flex-col items-center py-6 border-r flex-shrink-0 z-20 transition-all duration-300 shadow-2xl h-screen",
      variant === "dark"
        ? "border-slate-800/80 bg-slate-950"
        : "border-gray-200 bg-gray-900"
    )}>
      {/* Logo - Fixed at top */}
      <div className="mb-4 shrink-0">
        <Link href="/">
          <div className="transition-all hover:scale-110 active:scale-95">
            <DashfyLogoIcon size={56} />
          </div>
        </Link>
      </div>

      {/* Navigation items - centered in dashboard pages */}
      <div className={cn(
        "space-y-4 flex flex-col items-center w-full",
        isDashboard ? "justify-center flex-1" : ""
      )}>

        {currentItems.map(({ href, label, icon: Icon, color, activeColor, platform, isSvgIcon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href) && href !== "/dashboard");
          const isPlatformIcon = platform !== undefined;

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center w-[72px] h-[72px] rounded-2xl transition-all duration-300 group relative",
                active
                  ? (variant === "dark"
                    ? "bg-slate-900/80 border border-blue-500/30 shadow-[0_0_25px_rgba(59,130,246,0.15)] transform scale-[1.02]"
                    : "bg-blue-600 text-white")
                  : (variant === "dark"
                    ? "text-slate-400 hover:text-white hover:bg-slate-900/40"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white")
              )}
            >
              {isPlatformIcon ? (
                <div className="mb-1 transition-all duration-300 group-hover:scale-110">
                  <Icon active={active} />
                </div>
              ) : isSvgIcon ? (
                <div className="mb-1 transition-all duration-300 group-hover:scale-110">
                  <Icon active={active} />
                </div>
              ) : (
                <Icon
                  className={cn(
                    "w-6 h-6 mb-1 transition-all group-hover:scale-110",
                    active ? (activeColor || "text-blue-400") : (color || "opacity-70"),
                  )}
                />
              )}
              <span className={cn(
                "text-[8px] font-bold transition-colors text-center px-1 uppercase tracking-wider",
                active && variant === "dark" ? (activeColor || "text-blue-400/90") :
                  active && variant === "light" ? "text-white" :
                    "text-slate-400"
              )}>
                {label}
              </span>

              {/* Pill indicador ativo */}
              {active && variant === "dark" && (
                <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-blue-500 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.9)]" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Bottom Actions - Fixed at bottom */}
      <div className="mt-auto shrink-0 space-y-6 flex flex-col items-center w-full pt-6 pb-6">
        <div className="flex flex-col items-center gap-5">
          <Link
            href="/integracoes"
            className={cn(
              "transition-all duration-300 hover:scale-110 relative",
              variant === "dark" ? "text-slate-500 hover:text-blue-400" : "text-gray-400 hover:text-white"
            )}
            title="Configurações"
          >
            <Settings size={22} className="opacity-70 hover:opacity-100" />
            {onboardingPending && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
            )}
          </Link>

<button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={cn(
              "transition-all duration-300 hover:scale-110",
              variant === "dark" ? "text-slate-500 hover:text-red-400" : "text-gray-400 hover:text-white"
            )}
            title="Sair"
          >
            <LogOut size={22} className="opacity-70 hover:opacity-100" />
          </button>
        </div>
      </div>
    </aside>
  );
}
