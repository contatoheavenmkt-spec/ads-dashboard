import { Sidebar } from "@/components/layout/sidebar";
import { PlanGuard } from "@/components/dashboard/plan-guard";

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden font-sans bg-slate-900">
      <Sidebar />
      <main className="flex-1 h-full relative flex flex-col overflow-hidden pb-16 md:pb-0">
        <PlanGuard>
          {children}
        </PlanGuard>
      </main>
    </div>
  );
}
