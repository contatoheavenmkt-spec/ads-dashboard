import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Em produção com Next.js, o diretório public está em process.cwd()/public
    // mas após build pode estar em .next/standalone/public — usamos cwd sempre
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "png";
    const filename = `logo_${Date.now()}.${safeExt}`;
    await writeFile(path.join(uploadsDir, filename), buffer);

    return NextResponse.json({ url: `/uploads/${filename}` });
  } catch (err: any) {
    console.error("[upload] Erro:", err?.message ?? err);
    return NextResponse.json({ error: "Erro ao fazer upload. Verifique permissões da pasta." }, { status: 500 });
  }
}
