import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const uploadsDir = path.join(process.cwd(), "uploads");

// Whitelist explícita: SVG e ICO foram removidos para evitar XSS e content-type
// confusion. Se o arquivo no disco tiver outra extensão, é servido como octet-stream
// e o browser não vai renderizar como imagem.
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Prevent path traversal
  const safe = path.basename(filename);
  if (safe !== filename || !safe) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const buffer = await readFile(path.join(uploadsDir, safe));
    const ext = safe.split(".").pop()?.toLowerCase() ?? "";
    const contentType = MIME[ext] ?? "application/octet-stream";

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        // Impede o browser de adivinhar outro content-type (defesa contra
        // arquivos disfarçados servidos como text/html, p.ex.).
        "X-Content-Type-Options": "nosniff",
        // Força exibição inline (em <img>) em vez de execução como documento.
        "Content-Disposition": `inline; filename="${safe}"`,
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
