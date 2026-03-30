import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const dbUrl = process.env.DATABASE_URL ?? "file:prisma/dev.db";
console.log("Using URL:", dbUrl);

const adapter = new PrismaLibSql({ url: dbUrl });
const db = new PrismaClient({ adapter } as never);

db.user.findMany().then(r => {
  console.log("Users:", r);
  db.$disconnect();
}).catch(e => {
  console.error("Error:", e.message);
  db.$disconnect();
});
