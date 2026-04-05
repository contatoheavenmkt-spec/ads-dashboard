export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-900 text-slate-300 relative selection:bg-blue-500/30">
      {/* Background Gradient Effect - Exclusivo para Dashboard */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none z-0"></div>
      
      {/* Container de Conteúdo */}
      <div className="flex-1 flex flex-col relative z-10 h-full overflow-visible">
        {children}
      </div>
    </div>
  );
}
