"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  Zap,
  Share2,
  Users,
  LogOut,
  Settings
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

// Custom SVGs from Design System
const ChartIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
  </svg>
);

const GridIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
  </svg>
);

const MetaIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.0001 2.00018C6.47721 2.00018 2.00012 6.47728 2.00012 12.0002C2.00012 17.523 6.47721 22.0002 12.0001 22.0002C17.523 22.0002 22.0001 17.523 22.0001 12.0002C22.0001 6.47728 17.523 2.00018 12.0001 2.00018ZM8.49021 15.6582C7.0223 15.6582 5.83226 14.4682 5.83226 13.0002C5.83226 11.5323 7.0223 10.3423 8.49021 10.3423C9.95813 10.3423 11.1482 11.5323 11.1482 13.0002C11.1482 14.4682 9.95813 15.6582 8.49021 15.6582ZM15.5098 15.6582C14.0419 15.6582 12.8519 14.4682 12.8519 13.0002C12.8519 11.5323 14.0419 10.3423 15.5098 10.3423C16.9777 10.3423 18.1678 11.5323 18.1678 13.0002C18.1678 14.4682 16.9777 15.6582 15.5098 15.6582Z"></path>
  </svg>
);

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.0001 2.00018C6.47721 2.00018 2.00012 6.47728 2.00012 12.0002C2.00012 17.523 6.47721 22.0002 12.0001 22.0002C17.523 22.0002 22.0001 17.523 22.0001 12.0002C22.0001 6.47728 17.523 2.00018 12.0001 2.00018ZM15.5098 15.6582C14.0419 15.6582 12.8519 14.4682 12.8519 13.0002L8.49021 10.3423V15.6582C7.0223 15.6582 5.83226 14.4682 5.83226 13.0002C5.83226 11.5323 7.0223 10.3423 8.49021 10.3423C9.95813 10.3423 11.1482 11.5323 11.1482 13.0002L15.5098 10.3423C16.9777 10.3423 18.1678 11.5323 18.1678 13.0002C18.1678 14.4682 16.9777 15.6582 15.5098 15.6582Z"></path>
  </svg>
);

const GA4Icon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 19H21V21H3V19ZM14 5H18V17H14V5ZM8 10H12V17H8V10ZM2 14H6V17H2V14Z"></path>
  </svg>
);

interface NavItem {
  href: string;
  label: string;
  icon: any;
  color?: string;
  activeColor?: string;
  platform?: string; // qual plataforma precisa estar conectada para mostrar
  requiresMulti?: boolean; // só aparece se 2+ plataformas conectadas
}

const saasItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Zap },
  { href: "/integracoes", label: "Contas", icon: Share2 },
  { href: "/workspaces", label: "Workspaces", icon: Users },
];

const allDashboardItems: NavItem[] = [
  { href: "/dashboard", label: "Visão Geral", icon: GridIcon, requiresMulti: true },
  { href: "/dashboard/meta", label: "Meta Ads", icon: MetaIcon, color: "text-slate-500", activeColor: "text-blue-400", platform: "meta" },
  { href: "/dashboard/google", label: "Google Ads", icon: GoogleIcon, color: "text-slate-500", activeColor: "text-cyan-400", platform: "google" },
  { href: "/dashboard/ga4", label: "GA4", icon: GA4Icon, color: "text-orange-400", platform: "ga4" },
  { href: "/dashboard/detalhes", label: "Detalhes", icon: ChartIcon }, // sempre visível, sempre por último
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

  const isDashboard = pathname.startsWith("/dashboard");
  const variant = isDashboard ? "dark" : "light";

  useEffect(() => {
    if (isDashboard) {
      fetch("/api/connections/status")
        .then(r => r.json())
        .then(setConnections)
        .catch(() => null);
    }
  }, [isDashboard]);

  // Filtra itens baseado nas conexões ativas
  const dashboardItems = allDashboardItems.filter(item => {
    if (!connections) return true; // enquanto carrega, mostra tudo
    if (item.requiresMulti) return connections.connectedCount >= 2;
    if (item.platform) return connections[item.platform as keyof ConnectionStatus] === true;
    return true;
  });

  const currentItems = isDashboard ? dashboardItems : saasItems;

  const userInitials = session?.user?.name
    ? session.user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : "NA";

  return (
    <aside className={cn(
      "w-20 lg:w-24 flex flex-col items-center py-6 border-r flex-shrink-0 z-20 transition-all duration-300 shadow-2xl",
      variant === "dark"
        ? "border-slate-800/80 bg-slate-950"
        : "border-gray-200 bg-gray-900"
    )}>
      <div className="flex-1 space-y-4 flex flex-col items-center w-full overflow-y-auto no-scrollbar pt-2">
        {/* Logo/Home */}
        <div className="mb-6">
          <Link href="/">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-xl transition-all hover:scale-110 active:scale-95",
              variant === "dark" ? "bg-blue-600 shadow-blue-500/20" : "bg-blue-500 shadow-blue-500/10"
            )}>
              <Zap size={24} fill="currentColor" />
            </div>
          </Link>
        </div>

        {currentItems.map(({ href, label, icon: Icon, color, activeColor }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href) && href !== "/dashboard");
          const isGA4 = label === "GA4";

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
              <Icon
                className={cn(
                  "w-6 h-6 mb-1 transition-all group-hover:scale-110",
                  active ? (activeColor || "text-blue-400") : (color || "opacity-70"),
                  isGA4 && !active ? "text-orange-400 opacity-90" : ""
                )}
              />
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
                <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-blue-500 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.9)]"></div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Bottom Actions */}
      <div className="mt-auto space-y-6 flex flex-col items-center w-full pt-6">
        <div className="flex flex-col items-center gap-5">
          <Link
            href="/integracoes"
            className={cn(
              "transition-all duration-300 hover:scale-110",
              variant === "dark" ? "text-slate-500 hover:text-blue-400" : "text-gray-400 hover:text-white"
            )}
            title="Configurações"
          >
            <Settings size={22} className="opacity-70 hover:opacity-100" />
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

        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-transform hover:scale-105",
          variant === "dark"
            ? "bg-slate-800 border-slate-700 text-slate-100 shadow-lg shadow-black/20"
            : "bg-white border-gray-200 text-gray-900 shadow-md"
        )}>
          {userInitials}
        </div>
      </div>
    </aside>
  );
}
