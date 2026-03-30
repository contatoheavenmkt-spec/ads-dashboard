import { Sidebar } from "@/components/layout/sidebar";

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden font-sans bg-slate-900">
      <Sidebar />
      <main className="flex-1 h-full overflow-hidden relative flex flex-col">
        {children}
      </main>
    </div>
  );
}


