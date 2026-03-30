import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export interface ConnectionStatus {
  meta: boolean;
  google: boolean;
  ga4: boolean;
  connectedCount: number;
  platforms: string[];
}

// Plataformas com APIs mock ativas (dados ficticios para demonstração).
// Quando a integração real for adicionada ao DB, o mock é ignorado.
const MOCK_PLATFORMS = ["google", "ga4"];

export async function GET() {
  const integrations = await db.integration.findMany({
    where: { status: "active" },
    select: { platform: true },
  });

  const realPlatforms = [...new Set(integrations.map(i => i.platform))];

  // Junta plataformas reais + mock (sem duplicar)
  const allPlatforms = [...new Set([...realPlatforms, ...MOCK_PLATFORMS])];

  const status: ConnectionStatus = {
    meta: allPlatforms.includes("meta"),
    google: allPlatforms.includes("google"),
    ga4: allPlatforms.includes("ga4"),
    connectedCount: allPlatforms.length,
    platforms: allPlatforms,
  };

  return NextResponse.json(status);
}
