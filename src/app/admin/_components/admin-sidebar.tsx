"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, CreditCard, DollarSign,
  Link2, Settings, LogOut, BarChart2,
} from "lucide-react";
import { DashfyLogoIcon } from "@/components/logo/logo";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/admin/accounts", label: "Contas", icon: Users },
  { href: "/admin/subscriptions", label: "Assinaturas", icon: CreditCard },
  { href: "/admin/finance", label: "Financeiro", icon: DollarSign },
  { href: "/admin/integrations", label: "Integrações", icon: Link2 },
  { href: "/admin/settings", label: "Configurações", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-slate-950 border-r border-slate-800/80 h-full">
      {/* Header com logo */}
      <div className="px-5 py-5 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <DashfyLogoIcon size={36} />
          <div>
            <p className="text-[11px] font-black text-white tracking-tight">Dashfy</p>
            <p className="text-[9px] text-blue-400 uppercase tracking-widest font-bold">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <a
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                active
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              )}
            >
              <Icon size={15} className={active ? "text-blue-400" : "text-slate-500"} />
              {label}
              {active && (
                <div className="ml-auto w-1.5 h-4 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              )}
            </a>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-800/60">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-all"
        >
          <LogOut size={15} />
          Sair do Admin
        </button>
      </div>
    </aside>
  );
}
