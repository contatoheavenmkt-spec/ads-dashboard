import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Armazena fora de public/ para não depender do static file serving do Next.js
export const uploadsDir = path.join(process.cwd(), "uploads");

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Whitelist por extensão + magic bytes. SVG é proibido porque pode embutir JS.
const ALLOWED: Record<string, { mime: string; magic: number[][] }> = {
  png: { mime: "image/png", magic: [[0x89, 0x50, 0x4e, 0x47]] },
  jpg: { mime: "image/jpeg", magic: [[0xff, 0xd8, 0xff]] },
  jpeg: { mime: "image/jpeg", magic: [[0xff, 0xd8, 0xff]] },
  webp: { mime: "image/webp", magic: [[0x52, 0x49, 0x46, 0x46]] }, // RIFF... WEBP
  gif: { mime: "image/gif", magic: [[0x47, 0x49, 0x46, 0x38]] },
};

function magicBytesMatch(buf: Buffer, signatures: number[][]): boolean {
  return signatures.some((sig) => sig.every((b, i) => buf[i] === b));
}

export async function POST(req: NextRequest) {
  // Apenas usuários logados podem fazer upload (uploads são essencialmente
  // logos de workspace; clientes públicos não precisam).
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Rate limit: 20 uploads / hora por usuário.
  const rl = rateLimit(`upload:${session.user.id}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Limite de uploads atingido. Tente novamente mais tarde." },
      { status: 429 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Arquivo muito grande (limite: 5MB)" }, { status: 413 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowed = ALLOWED[ext];
    if (!allowed) {
      return NextResponse.json({ error: "Formato não suportado. Use PNG/JPG/WEBP/GIF." }, { status: 415 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Confere magic bytes para evitar arquivos disfarçados (ex.: .png contendo SVG/HTML).
    if (!magicBytesMatch(buffer, allowed.magic)) {
      return NextResponse.json({ error: "Conteúdo do arquivo não corresponde à extensão." }, { status: 400 });
    }
    // WEBP: confere também o marcador "WEBP" no offset 8
    if (ext === "webp" && buffer.slice(8, 12).toString("ascii") !== "WEBP") {
      return NextResponse.json({ error: "Arquivo WEBP inválido" }, { status: 400 });
    }

    await mkdir(uploadsDir, { recursive: true });

    // Nome aleatório — impede que clientes sobrescrevam uploads alheios.
    const filename = `logo_${session.user.id.slice(-6)}_${Date.now()}_${randomBytes(8).toString("hex")}.${ext}`;
    await writeFile(path.join(uploadsDir, filename), buffer);

    return NextResponse.json({ url: `/api/uploads/${filename}` });
  } catch (err: any) {
    console.error("[upload] Erro:", err?.message ?? err);
    return NextResponse.json({ error: "Erro ao fazer upload. Verifique permissões da pasta." }, { status: 500 });
  }
}
