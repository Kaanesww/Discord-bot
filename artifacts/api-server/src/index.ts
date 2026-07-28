import app from "./app";
import { logger } from "./lib/logger";
import { startBot } from "./bot/index";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Crash koruması — işlenmeyen hatalar botu çökertmesin ──────────────────────
process.on("uncaughtException", (err) => {
  logger.error({ err }, "İşlenmeyen istisna — bot çalışmaya devam ediyor");
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "İşlenmeyen promise reddi — bot çalışmaya devam ediyor");
});

// ── Sunucuyu başlat ───────────────────────────────────────────────────────────
const server = app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ── Keep-alive self-ping (her 4 dakikada bir) ────────────────────────────
  // Replit, belirli süre istek gelmezse uyku moduna geçer.
  // Kendi health endpoint'imize düzenli ping atarak uyanık kalıyoruz.
  const replitDomain = process.env["REPLIT_DEV_DOMAIN"];
  const pingUrl = replitDomain
    ? `https://${replitDomain}/api/healthz`
    : `http://localhost:${port}/api/healthz`;

  const PING_INTERVAL_MS = 4 * 60 * 1000; // 4 dakika

  async function selfPing(): Promise<void> {
    try {
      const res = await fetch(pingUrl, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) logger.warn({ status: res.status }, "Keep-alive ping başarısız");
    } catch (err) {
      logger.warn({ err }, "Keep-alive ping hatası");
    }
  }

  // İlk ping 30 sn sonra (sunucunun tamamen ayağa kalkması için)
  setTimeout(() => {
    selfPing().catch(() => null);
    setInterval(() => selfPing().catch(() => null), PING_INTERVAL_MS);
  }, 30_000);

  logger.info({ pingUrl, intervalMin: 4 }, "Keep-alive sistemi aktif");
});

// Sunucu hataları (EADDRINUSE vb.)
server.on("error", (err) => {
  logger.error({ err }, "Sunucu hatası");
  process.exit(1);
});

// ── Discord botunu başlat ─────────────────────────────────────────────────────
startBot().catch((err) => {
  logger.error({ err }, "Discord botu başlatılamadı");
});
