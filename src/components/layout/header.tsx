import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  Filter,
  Download,
  ChevronDown,
  Calendar,
  Layers,
  Zap,
  Check,
  Search,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Integration {
  id: string;
  adAccountId: string;
  name: string;
  bmId?: string | null;
  bmName: string | null;
  platform: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  days?: number;
  onDaysChange?: (days: number) => void;
  accounts?: Integration[];
  selectedAccount?: Integration | null;
  onAccountChange?: (acc: Integration | null) => void;
  campaigns?: Campaign[];
  selectedCampaign?: Campaign | null;
  onCampaignChange?: (camp: Campaign | null) => void;
  onDownload?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const PERIOD_OPTIONS = [
  { label: "Hoje", days: 1 },
  { label: "Últimos 7 dias", days: 7 },
  { label: "Últimos 15 dias", days: 15 },
  { label: "Últimos 30 dias", days: 30 },
  { label: "Últimos 90 dias", days: 90 },
];

// ─── Platform icons ──────────────────────────────────────────────

const MetaIcon = () => (
  <img src="/icon-meta.png" alt="Meta Ads" className="w-6 h-6 object-contain" />
);

const GoogleAdsIcon = () => (
  <img src="/icon-google-ads.webp" alt="Google Ads" className="w-5 h-5 object-contain" />
);

const GA4Icon = () => (
  <img src="/icon-ga4.png" alt="Google Analytics 4" className="w-5 h-5 object-contain" />
);

const DashboardIcon = () => <BarChart3 size={18} />;
const DetailsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <rect x="8" y="12" width="2" height="5" fill="#60a5fa" rx="0.5" />
    <rect x="12" y="10" width="2" height="7" fill="#60a5fa" rx="0.5" />
    <rect x="16" y="13" width="2" height="4" fill="#60a5fa" rx="0.5" />
  </svg>
);

function PlatformIcon({ pathname }: { pathname: string }) {
  if (pathname.includes("/dashboard/meta") || pathname.includes("/cliente/") && pathname.includes("meta")) return <MetaIcon />;
  if (pathname.includes("/dashboard/google") || pathname.includes("/cliente/") && pathname.includes("google")) return <GoogleAdsIcon />;
  if (pathname.includes("/dashboard/ga4")) return <GA4Icon />;
  if (pathname.includes("/dashboard/detalhes")) return <DetailsIcon />;
  return <DashboardIcon />;
}

function platformColor(pathname: string) {
  if (pathname.includes("/dashboard/meta")) return "text-blue-500";
  if (pathname.includes("/dashboard/google")) return "text-cyan-400";
  if (pathname.includes("/dashboard/ga4")) return "text-orange-500";
  if (pathname.includes("/dashboard/detalhes")) return "text-purple-400";
  return "text-blue-500";
}

export function Header({
  title,
  subtitle,
  days,
  onDaysChange,
  accounts = [],
  selectedAccount,
  onAccountChange,
  campaigns = [],
  selectedCampaign,
  onCampaignChange,
  onDownload,
  onRefresh,
  isRefreshing,
}: HeaderProps) {
  const pathname = usePathname();
  const isLight = pathname.startsWith("/login") || pathname.startsWith("/cliente");
  const variant = isLight ? "light" : "dark";
  const [mounted, setMounted] = useState(false);

  const [daysOpen, setDaysOpen] = useState(false);
  const [accOpen, setAccOpen] = useState(false);
  const [campsOpen, setCampsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!daysOpen && !accOpen && !campsOpen) return;
    function handleClickOutside() {
      setDaysOpen(false);
      setAccOpen(false);
      setCampsOpen(false);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [daysOpen, accOpen, campsOpen]);

  const currentPeriodLabel = PERIOD_OPTIONS.find(p => p.days === days)?.label || (days ? `Últimos ${days} dias` : "Período");

  const filteredCampaigns = campaigns.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <header className={cn(
      "px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b sticky top-0 z-30 transition-colors duration-500",
      variant === "dark"
        ? "border-slate-700/50 bg-slate-900/40 backdrop-blur-md"
        : "border-gray-200 bg-white"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center",
          variant === "dark" ? "text-blue-500" : "text-blue-600 bg-blue-50"
        )}>
          <PlatformIcon pathname={pathname} />
        </div>
        <div className="flex items-center">
          <h1 className={cn(
            "text-xl font-bold tracking-tight",
            variant === "dark" ? "text-slate-100" : "text-gray-900"
          )}>{title}</h1>

          {subtitle && variant === "dark" ? (
            <div className="flex items-center">
              <div className="h-4 w-px bg-slate-600 mx-4"></div>
              <p className="text-sm text-slate-400">
                {subtitle.split('|')[0]}
                {subtitle.includes('|') && (
                  <>| <span className="text-slate-200 font-medium italic">{subtitle.split('|')[1]}</span></>
                )}
                {selectedCampaign && (
                  <span className="ml-2 text-blue-400 font-bold px-2 py-0.5 bg-blue-500/10 rounded border border-blue-500/20 text-[10px] uppercase">
                    {selectedCampaign.name}
                  </span>
                )}
              </p>
            </div>
          ) : subtitle && (
            <div className="ml-4">
              <p className={cn(
                "text-xs mt-0.5",
                variant === "dark" ? "text-slate-400" : "text-gray-500"
              )}>{subtitle}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Atualizar dados"
            className="p-2 rounded-lg border transition-all active:scale-95 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
          </button>
        )}
        {onDaysChange && (
          <>
            {/* Account Filter */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setAccOpen(!accOpen); setDaysOpen(false); setCampsOpen(false); }}
                className={cn(
                  "p-2 rounded-lg transition-all shadow-lg active:scale-95 flex items-center justify-center",
                  accOpen ? "bg-blue-400 text-white" : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20"
                )}
              >
                <Filter size={16} />
              </button>
              {accOpen && (
                <div className="absolute right-0 mt-3 w-72 bg-slate-950/98 backdrop-blur-xl rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-2 z-50 border border-slate-700/50 max-h-[400px] overflow-y-auto no-scrollbar animate-in fade-in zoom-in duration-200">
                  {/* TODAS AS CONTAS - Destaque especial */}
                  <button
                    onClick={() => { onAccountChange?.(null); setAccOpen(false); }}
                    className={cn(
                      "w-full text-left px-4 py-3 text-xs font-bold transition-all flex items-center justify-between border-b border-slate-700/50 mb-1",
                      !selectedAccount
                        ? "bg-blue-600/20 text-blue-400"
                        : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Layers size={14} />
                      <span className="uppercase tracking-[0.15em]">Todas as Contas</span>
                    </div>
                    {!selectedAccount && <Check size={12} />}
                  </button>

                  {accounts.length > 0 ? (
                    <>
                      {/* Meta Ads Section */}
                      {accounts.filter(a => a.platform === "meta").length > 0 && (
                        <div className="px-2 py-1">
                          <div className="flex items-center gap-2 px-2 py-1.5">
                            <img src="/icon-meta.png" alt="Meta" className="w-4 h-4 object-contain" />
                            <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Meta Ads</span>
                          </div>
                          {accounts.filter(a => a.platform === "meta").map(acc => (
                            <button key={acc.id} onClick={() => { onAccountChange?.(acc); setAccOpen(false); }}
                              className={cn("w-full text-left px-4 py-2.5 text-xs font-medium rounded-lg transition-all flex items-center justify-between mb-0.5",
                                selectedAccount?.id === acc.id ? "bg-blue-600/30 text-blue-400 border border-blue-500/30" : "text-slate-400 hover:bg-white/5 hover:text-white"
                              )}>
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                <span className="truncate">{acc.name}</span>
                              </div>
                              {selectedAccount?.id === acc.id && <Check size={12} />}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Google Ads Section */}
                      {accounts.filter(a => a.platform === "google").length > 0 && (
                        <div className="px-2 py-1">
                          <div className="flex items-center gap-2 px-2 py-1.5 border-t border-slate-700/30 mt-1 pt-2">
                            <img src="/icon-google-ads.webp" alt="Google" className="w-4 h-4 object-contain" />
                            <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest">Google Ads</span>
                          </div>
                          {accounts.filter(a => a.platform === "google").map(acc => (
                            <button key={acc.id} onClick={() => { onAccountChange?.(acc); setAccOpen(false); }}
                              className={cn("w-full text-left px-4 py-2.5 text-xs font-medium rounded-lg transition-all flex items-center justify-between mb-0.5",
                                selectedAccount?.id === acc.id ? "bg-cyan-600/30 text-cyan-400 border border-cyan-500/30" : "text-slate-400 hover:bg-white/5 hover:text-white"
                              )}>
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
                                <span className="truncate">{acc.name}</span>
                              </div>
                              {selectedAccount?.id === acc.id && <Check size={12} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="px-4 py-8 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest opacity-50">Nenhuma conta vinculada</div>
                  )}
                </div>
              )}
            </div>

            {/* Download */}
            {onDownload && (
              <>
                <button type="button" onClick={(e) => { e.stopPropagation(); onDownload(); }}
                  className="p-2 rounded-lg border transition-all active:scale-95 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300">
                  <Download size={16} />
                </button>
                <div className="h-6 w-px mx-1 bg-slate-700" />
              </>
            )}

            {/* Campanhas */}
            <div className="relative">
              <button type="button" onClick={(e) => { e.stopPropagation(); setCampsOpen(!campsOpen); setAccOpen(false); setDaysOpen(false); }}
                className={cn("flex items-center gap-2 px-2 md:px-3 py-2 rounded-lg border text-xs font-medium transition-colors active:scale-95",
                  campsOpen ? "bg-slate-700 border-slate-600 text-white" : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700"
                )}>
                <Layers size={14} className={cn("transition-opacity shrink-0", campsOpen ? "opacity-100" : "opacity-50")} />
                <span className="hidden md:inline max-w-[100px] truncate">{selectedCampaign ? selectedCampaign.name : "Campanhas"}</span>
                <ChevronDown size={14} className={cn("hidden md:block transition-transform opacity-30", campsOpen ? "rotate-180" : "")} />
              </button>
              {campsOpen && (
                <div className="absolute right-0 mt-3 w-72 bg-slate-950/98 backdrop-blur-xl rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-2 z-50 border border-slate-700/50 animate-in fade-in zoom-in duration-200">
                  <div className="px-3 pb-2 pt-1">
                    <div className="relative">
                      <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-slate-500" />
                      <input autoFocus type="text" placeholder="Pesquisar campanha..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg py-2 pl-9 pr-3 text-[11px] text-white focus:outline-none focus:border-blue-500/50 transition-all font-medium placeholder:text-slate-600" />
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                    <button onClick={() => { onCampaignChange?.(null); setCampsOpen(false); }}
                      className={cn("w-full text-left px-4 py-2 text-[10px] font-black transition-colors flex items-center justify-between uppercase tracking-widest",
                        !selectedCampaign ? "bg-blue-600/20 text-blue-400" : "text-slate-500 hover:text-white"
                      )}>
                      TODAS AS CAMPANHAS
                      {!selectedCampaign && <Check size={10} />}
                    </button>
                    <div className="h-px bg-slate-700/30 my-1 mx-2" />
                    {filteredCampaigns.length > 0 ? filteredCampaigns.map(camp => (
                      <button key={camp.id} onClick={() => { onCampaignChange?.(camp); setCampsOpen(false); }}
                        className={cn("w-full text-left px-4 py-2 text-xs font-medium transition-colors flex items-center justify-between",
                          selectedCampaign?.id === camp.id ? "bg-blue-600/20 text-blue-400" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                        )}>
                        <div className="flex flex-col">
                          <span className="truncate max-w-[200px]">{camp.name}</span>
                          <span className={cn("text-[8px] font-bold uppercase", camp.status === "ACTIVE" ? "text-emerald-500" : "text-slate-500")}>
                            {camp.status === "ACTIVE" ? "Ativa" : "Pausada"}
                          </span>
                        </div>
                        {selectedCampaign?.id === camp.id && <Check size={12} />}
                      </button>
                    )) : (
                      <div className="px-4 py-4 text-center text-[10px] font-bold text-slate-600 uppercase italic">Nenhuma campanha encontrada</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Período */}
            <div className="relative">
              <button type="button" onClick={(e) => { e.stopPropagation(); setDaysOpen(!daysOpen); setAccOpen(false); setCampsOpen(false); }}
                className={cn("flex items-center gap-2 px-2 md:px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap active:scale-95",
                  daysOpen ? "bg-slate-700 border-slate-600 text-white" : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700"
                )}>
                <Calendar size={14} className={cn("transition-opacity shrink-0", daysOpen ? "opacity-100" : "opacity-50")} />
                <span className="hidden lg:inline">{mounted ? currentPeriodLabel : "..."}</span>
                <ChevronDown size={14} className={cn("hidden lg:block transition-transform opacity-30", daysOpen ? "rotate-180" : "")} />
              </button>
              {daysOpen && (
                <div className="absolute right-0 mt-3 w-48 bg-slate-950/98 backdrop-blur-xl rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-2 z-50 border border-slate-700/50 animate-in fade-in zoom-in duration-200">
                  {PERIOD_OPTIONS.map(opt => (
                    <button key={opt.days} onClick={() => { onDaysChange(opt.days); setDaysOpen(false); }}
                      className={cn("w-full text-left px-4 py-2 text-xs font-medium transition-colors flex items-center justify-between",
                        days === opt.days ? "bg-blue-600/20 text-blue-400" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      )}>
                      {opt.label}
                      {days === opt.days && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </header>
  );
}
