import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dashfy",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-2 group">
            <img src="/logo-full.png" alt="Dashfy" className="h-7 object-contain" />
          </Link>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/about" className="hover:text-white transition-colors">Sobre</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacidade</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Termos</Link>
            <Link
              href="/login"
              className="ml-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
            >
              Entrar
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-16">
        <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Dashfy. Todos os direitos reservados.</span>
          <div className="flex gap-5">
            <Link href="/about" className="hover:text-slate-300 transition-colors">Sobre</Link>
            <Link href="/privacy" className="hover:text-slate-300 transition-colors">Política de Privacidade</Link>
            <Link href="/terms" className="hover:text-slate-300 transition-colors">Termos de Uso</Link>
            <Link href="/data-deletion" className="hover:text-slate-300 transition-colors">Exclusão de Dados</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
