import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

// Veri klasörünü oluştur (yoksa)
const dataDir = path.resolve(process.cwd(), "../../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "bot.db");

const client = createClient({ url: `file:${dbPath}` });

export const db = drizzle(client, { schema });

export * from "./schema";
