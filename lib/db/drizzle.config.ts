import { defineConfig } from "drizzle-kit";
import path from "path";

const dbPath = path.resolve(__dirname, "../../data/bot.db");

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "turso",
  dbCredentials: {
    url: `file:${dbPath}`,
  },
});
