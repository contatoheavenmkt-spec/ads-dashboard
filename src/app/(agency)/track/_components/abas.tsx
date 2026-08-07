"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Brain, Link2, Settings, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/track", label: "Visão geral", icon: BarChart3 },
  { href: "/track/links", label: "Links", icon: Link2 },
  { href: "/track/whatsapp", label: "WhatsApp", icon: Smartphone },
  { href: "/track/config", label: "Regras", icon: Settings },
  { href: "/track/ia", label: "IA", icon: Brain },
];

export function AbasTrack() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 px-4 sm:px-6">
      {ABAS.map((aba) => {
        // "/track" só fica ativo no caminho exato, senão ficaria aceso em todas.
        const ativo = aba.href === "/track" ? pathname === "/track" : pathname.startsWith(aba.href);
        const Icone = aba.icon;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors",
              ativo
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-slate-500 hover:text-slate-300",
            )}
          >
            <Icone size={13} />
            {aba.label}
          </Link>
        );
      })}
    </div>
  );
}
