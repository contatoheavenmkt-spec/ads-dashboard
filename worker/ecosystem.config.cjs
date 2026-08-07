/**
 * PM2 do worker do Track.
 *
 * Processo separado do `ads-dashboard` de propósito: um build ou reload do
 * Next não pode derrubar sessão de WhatsApp, e uma sessão travada não pode
 * derrubar o site.
 *
 * Deploy:
 *   pm2 start worker/ecosystem.config.cjs
 *   pm2 save
 *
 * ATENÇÃO: `npx prisma generate` precisa ter rodado antes, porque o client
 * fica em src/generated/prisma e é gitignored. Sem isso o worker sobe e morre
 * no primeiro import.
 */
module.exports = {
  apps: [
    {
      name: "dashfys-track",
      script: "./worker/index.ts",
      cwd: "/root/ads-dashboard",
      interpreter: "node",
      // O Prisma Client gerado é TypeScript + ESM, então o worker roda TS
      // direto via tsx. Não dá para ser CommonJS como o worker do AtendeAI.
      interpreter_args: "--import tsx",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "30s",
      restart_delay: 5000,
      // Uma sessão Baileys custa cerca de 25 MB (medido no AtendeAI: 9 sessões
      // em 224 MB). Com o tsx por cima, 20 sessões ficam perto de 560 MB.
      max_memory_restart: "600M",
      // Tempo para fechar os sockets com calma no SIGTERM: derrubar no soco
      // faz o WhatsApp ver desconexão suja.
      kill_timeout: 20000,
      env: {
        NODE_ENV: "production",
      },
      error_file: "/root/.pm2/logs/dashfys-track-error.log",
      out_file: "/root/.pm2/logs/dashfys-track-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
