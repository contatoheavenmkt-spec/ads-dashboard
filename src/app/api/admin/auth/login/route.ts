import { NextRequest, NextResponse } from "next/server";
import { signAdminToken, setAdminCookie } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return NextResponse.json({ error: "Admin não configurado" }, { status: 503 });
  }

  // Delay artificial para mitigar brute force
  await new Promise((r) => setTimeout(r, 400));

  if (email !== adminEmail || password !== adminPassword) {
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const token = signAdminToken();
  const res = NextResponse.json({ ok: true });
  return setAdminCookie(res, token);
}
