import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

// Ícone padrão do site (favicon e icon do PWA). Substitui o `icon.png`
// retangular antigo (1536x1024 ficava com faixa lateral no Chrome/Android).
// Renderiza dinamicamente um quadrado com o fundo dark Dashfy + logo central.

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default async function Icon() {
  const logoPath = join(process.cwd(), "public", "logo-icon.png");
  const buffer = await readFile(logoPath);
  // ImageResponse aceita data URI em <img>. base64 incha ~33% mas só serve
  // 192x192, tamanho desprezível.
  const dataUri = `data:image/png;base64,${buffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
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
          style={{ width: "75%", height: "75%", objectFit: "contain" }}
        />
      </div>
    ),
    { ...size },
  );
}
