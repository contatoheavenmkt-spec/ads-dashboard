import { db } from "../src/lib/db";

async function migrate() {
  const users = await db.user.findMany({
    where: { role: "AGENCY", workspaceId: { not: null } },
    select: { id: true, workspaceId: true, email: true },
  });
  console.log("Users AGENCY com workspace:", users.length);

  let updated = 0;
  for (const u of users) {
    const ws = await db.workspace.findUnique({
      where: { id: u.workspaceId! },
      select: { id: true, ownerId: true },
    });
    if (ws && !ws.ownerId) {
      await db.workspace.update({ where: { id: ws.id }, data: { ownerId: u.id } });
      console.log(`Updated workspace ${ws.id} -> ownerId = ${u.id} (${u.email})`);
      updated++;
    } else if (ws?.ownerId) {
      console.log(`Workspace ${ws.id} ja tem ownerId: ${ws.ownerId}`);
    }
  }
  console.log(`\nDone. ${updated} workspaces atualizados.`);
  await db.$disconnect();
}

migrate().catch((e) => { console.error(e); process.exit(1); });
