import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Providers } from "@/components/providers";
import { Tracker } from "@/components/tracking/tracker";
import { InstallPrompt, ServiceWorkerRegister } from "@/components/pwa/install-prompt";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Dashfy — Dashboard de Tráfego Pago",
  description: "Plataforma de dashboards para agências de marketing digital",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dashfy",
  },
  // `icons` removido propositadamente. Next 16 auto-detecta `src/app/icon.tsx`
  // e `src/app/apple-icon.tsx` (geradores dinâmicos quadrados com a logo).
  // Definir aqui sobrescreve a auto-detecção e o browser cai num favicon
  // padrão (triângulo do Next que veio do create-next-app).
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={geist.variable} suppressHydrationWarning>
      <body className="bg-gray-50 text-gray-900 antialiased" suppressHydrationWarning>
        <Providers>
          <Tracker />
          <ServiceWorkerRegister />
          <InstallPrompt />
          {children}
        </Providers>
      </body>
    </html>
  );
}

