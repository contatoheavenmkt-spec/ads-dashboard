import type { NextConfig } from "next";

/**
 * Headers de segurança aplicados a TODAS as rotas. Reduzem superfície de
 * ataque a custo praticamente zero (só configuração).
 *
 * Não adiciono Content-Security-Policy aqui — CSP em Next inline com
 * ChartJS, Tailwind utility-first e react-chartjs-2 exige nonces ou
 * `unsafe-inline` que reduz pra zero o benefício. Pode ser adicionado
 * depois se virar requisito de compliance.
 */
const securityHeaders = [
  // Impede o site de ser embedado em iframe de outros domínios (anti-clickjacking).
  // SAMEORIGIN em vez de DENY pra permitir embeds futuros dentro do próprio domínio.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Browser não tenta adivinhar MIME type (anti-XSS via tipo errado).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Força HTTPS por 2 anos, inclui subdomínios. Cliente que acessar via
  // http://dashfys.com.br/... é redirecionado pelo navegador.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Envia Referer só pra mesma origem ou cross-origin com HTTPS.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desativa APIs sensíveis que a app não usa (câmera, microfone, geo, USB, etc).
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
