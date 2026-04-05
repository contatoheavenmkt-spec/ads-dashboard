"use client";

import { cn } from "@/lib/utils";
import { LogOut, LayoutDashboard } from "lucide-react";
import React from "react";
import { DashfyLogoIcon } from "@/components/logo/logo";

// ─── Platform icons (using real images) ──────────────────────────────────────

const MetaIcon = () => (
  <img
    src="/icon-meta.png"
    alt="Meta Ads"
    className="w-7 h-7 object-contain"
  />
);

const GoogleAdsIcon = () => (
  <img
    src="/icon-google-ads.webp"
    alt="Google Ads"
    className="w-6 h-6 object-contain"
  />
);

const GA4Icon = () => (
  <img
    src="/icon-ga4.png"
    alt="Google Analytics 4"
    className="w-6 h-6 object-contain"
  />
);

const DetailsIcon = ({ active }: { active?: boolean }) => (
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
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientView = "meta" | "google" | "ga4" | "overview" | "detalhes";

interface NavItem {
  id: ClientView;
  label: string;
  icon: React.ReactNode;
  platform?: string;
}

interface ClientSidebarProps {
  logo?: string | null;
  workspaceName: string;
  platforms: string[]; // e.g. ["meta", "google"]
  view: ClientView;
  onViewChange: (v: ClientView) => void;
  onLogout?: () => void; // presente apenas nas páginas de login autenticado
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClientSidebar({ logo, workspaceName, platforms, view, onViewChange, onLogout }: ClientSidebarProps) {
  const hasMeta = platforms.includes("meta");
  const hasGoogle = platforms.includes("google");
  const hasGA4 = platforms.includes("ga4");
  const platformCount = [hasMeta, hasGoogle, hasGA4].filter(Boolean).length;

  const navItems: NavItem[] = [
    ...(platformCount >= 2 ? [{ id: "overview" as ClientView, label: "Visão Geral", icon: <GridIcon className="w-6 h-6 mb-1" /> }] : []),
    ...(hasMeta ? [{ id: "meta" as ClientView, label: "Meta Ads", icon: <MetaIcon />, platform: "meta" }] : []),
    ...(hasGoogle ? [{ id: "google" as ClientView, label: "Google Ads", icon: <GoogleAdsIcon />, platform: "google" }] : []),
    ...(hasGA4 ? [{ id: "ga4" as ClientView, label: "GA4", icon: <GA4Icon />, platform: "ga4" }] : []),
    { id: "detalhes" as ClientView, label: "Detalhes", icon: <DetailsIcon /> },
  ];

  // Se nenhuma plataforma conectada, mostra pelo menos Meta
  const items = navItems.length <= 1 ? [
    { id: "meta" as ClientView, label: "Meta Ads", icon: <MetaIcon />, platform: "meta" },
    { id: "detalhes" as ClientView, label: "Detalhes", icon: <DetailsIcon /> },
  ] : navItems;

  return (
    <aside className="w-20 lg:w-24 flex flex-col items-center py-6 border-r border-slate-800/80 bg-slate-950 flex-shrink-0 z-20 shadow-2xl">
      {/* Logo Dashfy */}
      <div className="mb-4 shrink-0">
        <DashfyLogoIcon size={52} />
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-slate-800 mb-4" />

      {/* Logo do workspace */}
      <div className="mb-6">
        {logo ? (
          <img
            src={logo}
            alt={workspaceName}
            className="w-12 h-12 rounded-2xl object-cover border border-slate-700 shadow-xl"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              const parent = (e.target as HTMLElement).parentElement;
              const fallback = parent?.querySelector(".fallback-icon") as HTMLElement | null;
              if (fallback) fallback.style.display = "flex";
            }}
          />
        ) : null}
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl ${logo ? "fallback-icon hidden" : "bg-white/8 border-2 border-slate-700"
            }`}
        >
          <LayoutDashboard size={20} className="text-slate-400" />
        </div>
      </div>

      {/* Nav items */}
      <div className="flex-1 space-y-4 flex flex-col items-center justify-center w-full overflow-y-auto no-scrollbar">
        {items.map(({ id, label, icon, platform }) => {
          const active = view === id;
          const isPlatformIcon = !!platform;

          const iconWithProps = React.isValidElement(icon)
            ? React.cloneElement(icon as React.ReactElement<{ active?: boolean }>, { active })
            : icon;

          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              className={cn(
                "flex flex-col items-center justify-center w-[72px] h-[72px] rounded-2xl transition-all duration-300 group relative",
                active
                  ? "bg-slate-900/80 border border-blue-500/30 shadow-[0_0_25px_rgba(59,130,246,0.15)] scale-[1.02]"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/40"
              )}
            >
              {isPlatformIcon ? (
                <div
                  className="mb-1 transition-all duration-300 group-hover:scale-110"
                  style={{
                    filter: active ? "none" : "grayscale(1) brightness(0.55)",
                    transition: "filter 0.25s ease, transform 0.2s ease",
                  }}
                >
                  {icon}
                </div>
              ) : (
                <div className={cn(
                  "mb-1 transition-all group-hover:scale-110",
                  active ? "text-blue-400" : "opacity-70"
                )}>
                  {iconWithProps}
                </div>
              )}
              <span className={cn(
                "text-[8px] font-bold transition-colors text-center px-1 uppercase tracking-wider",
                active ? "text-blue-400/90" : "text-slate-400"
              )}>
                {label}
              </span>

              {/* Pill indicador ativo */}
              {active && (
                <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-blue-500 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.9)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Logout — só aparece em páginas autenticadas */}
      {onLogout && (
        <div className="mt-auto pt-6">
          <button
            onClick={onLogout}
            className="text-slate-500 hover:text-red-400 transition-all duration-300 hover:scale-110"
            title="Sair"
          >
            <LogOut size={22} className="opacity-70 hover:opacity-100" />
          </button>
        </div>
      )}
    </aside>
  );
}
