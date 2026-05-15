import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStoredMetaToken } from "@/lib/meta-token";
import { getAccountCampaigns, type MetaCampaign } from "@/lib/meta-api";
import { sendToWorkspaceClients, sendToUser } from "@/lib/push";
import { authorizeCron, brToday } from "@/lib/cron-auth";

interface ChangeNotice {
  workspaceId: string;
  ownerUserId: string | null;
  campaignId: string;
  campaignName: string;
  // "activated" = passou a ACTIVE; "deactivated" = saiu de ACTIVE; "new" = nunca tinha sido vista
  kind: "activated" | "deactivated" | "new";
  status: string;
}

const ACTIVE_SET = new Set(["ACTIVE"]);

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const today = brToday();
  const changes: ChangeNotice[] = [];

  // Itera workspaces com integrações Meta. Limitamos a 200 por execução pra
  // não estourar o tempo de request quando o sistema tiver muitos clientes.
  const workspaces = await db.workspace.findMany({
    where: {
      integrations: { some: { integration: { platform: "meta", status: "active" } } },
    },
    include: {
      integrations: { include: { integration: true } },
    },
    take: 200,
  });

  for (const ws of workspaces) {
    if (!ws.ownerId) continue;
    const token = await getStoredMetaToken(ws.ownerId);
    if (!token) continue;

    const accountIds = ws.integrations
      .filter((wi) => wi.integration.platform === "meta")
      .map((wi) => wi.integration.adAccountId);

    // Coleta campanhas atuais
    const currentCampaigns: MetaCampaign[] = [];
    for (const accountId of accountIds) {
      try {
        const camps = await getAccountCampaigns(accountId, token, 7);
        currentCampaigns.push(...camps);
      } catch (err: unknown) {
        console.warn(
          `[cron/check-campaigns] ${accountId}:`,
          (err as Error)?.message ?? "fetch failed",
        );
      }
    }

    if (currentCampaigns.length === 0) continue;

    // Snapshots anteriores
    const snapshots = await db.campaignSnapshot.findMany({
      where: { workspaceId: ws.id, campaignId: { in: currentCampaigns.map((c) => c.id) } },
    });
    const snapMap = new Map(snapshots.map((s) => [s.campaignId, s]));

    for (const c of currentCampaigns) {
      const prev = snapMap.get(c.id);
      const wasActive = prev ? ACTIVE_SET.has(prev.status) : false;
      const isActive = ACTIVE_SET.has(c.status);

      if (!prev) {
        // Nunca vista antes — só notifica se chegou ativa, pra evitar barulho
        // com campanhas antigas paused descobertas agora.
        if (isActive) {
          changes.push({
            workspaceId: ws.id,
            ownerUserId: ws.ownerId,
            campaignId: c.id,
            campaignName: c.name,
            kind: "new",
            status: c.status,
          });
        }
      } else if (!wasActive && isActive) {
        changes.push({
          workspaceId: ws.id,
          ownerUserId: ws.ownerId,
          campaignId: c.id,
          campaignName: c.name,
          kind: "activated",
          status: c.status,
        });
      } else if (wasActive && !isActive) {
        changes.push({
          workspaceId: ws.id,
          ownerUserId: ws.ownerId,
          campaignId: c.id,
          campaignName: c.name,
          kind: "deactivated",
          status: c.status,
        });
      }
    }

    // Atualiza snapshots (upsert em batch)
    for (const c of currentCampaigns) {
      await db.campaignSnapshot
        .upsert({
          where: { workspaceId_campaignId: { workspaceId: ws.id, campaignId: c.id } },
          create: {
            workspaceId: ws.id,
            campaignId: c.id,
            name: c.name,
            status: c.status,
            spend: c.spend,
          },
          update: {
            name: c.name,
            status: c.status,
            spend: c.spend,
          },
        })
        .catch(() => {});
    }
  }

  // Dispara notificações. Dedup key inclui campanha + dia + tipo — se o
  // cron rodar 6 vezes na hora, só a primeira envia.
  for (const ch of changes) {
    const dedupeKey = `campaign_${ch.kind}:${ch.campaignId}:${today}`;
    let title = "";
    let body = "";

    if (ch.kind === "activated" || ch.kind === "new") {
      title = "Nova campanha ativa";
      body = `${ch.campaignName} está rodando agora.`;
    } else {
      title = "Campanha pausada";
      body = `${ch.campaignName} foi pausada/cancelada.`;
    }

    // Cliente final recebe. Agência (owner) recebe junto se tiver subscription.
    await sendToWorkspaceClients(
      ch.workspaceId,
      { title, body, url: "/" },
      { type: `campaign_${ch.kind}`, dedupeKey },
    );
    if (ch.ownerUserId) {
      await sendToUser(
        ch.ownerUserId,
        { title, body, url: `/workspaces/${ch.workspaceId}` },
        {
          type: `campaign_${ch.kind}`,
          dedupeKey: `${dedupeKey}:owner`,
          workspaceId: ch.workspaceId,
        },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    workspacesChecked: workspaces.length,
    changes: changes.length,
  });
}
