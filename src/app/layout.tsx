import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Providers } from "@/components/providers";
import { Tracker } from "@/components/tracking/tracker";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Dashfy — Dashboard de Tráfego Pago",
  description: "Plataforma de dashboards para agências de marketing digital",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo-icon.png", type: "image/png" },
    ],
    apple: "/logo-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={geist.variable} suppressHydrationWarning>
      <body className="bg-gray-50 text-gray-900 antialiased" suppressHydrationWarning>
        <Providers>
          <Tracker />
          {children}
        </Providers>
      </body>
    </html>
  );
}

