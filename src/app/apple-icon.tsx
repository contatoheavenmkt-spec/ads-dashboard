import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

// Apple touch icon (180x180). iOS usa essa imagem como ícone do app quando o
// user faz "Adicionar à Tela de Início" via Safari Compartilhar. Quadrado e
// com bordas — iOS aplica máscara arredondada automaticamente.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const logoPath = join(process.cwd(), "public", "logo-icon.png");
  const buffer = await readFile(logoPath);
  const dataUri = `data:image/png;base64,${buffer.toString("base64")}`;

  return new ImageResponse(
    (
      // iOS aplica máscara arredondada automaticamente e exige um fundo opaco
      // (Apple não aceita PNG transparente como apple-touch-icon — fica
      // preto na home screen). Usa o azul-marinho do tema Dashfy.
      <div
        style={{
          background: "#0f172a",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUri}
          alt="Dashfy"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
    ),
    { ...size },
  );
}
