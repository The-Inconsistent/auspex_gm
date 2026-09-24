import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

export const db = drizzle(process.env.DATABASE_URL, { schema, casing: "snake_case" });
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const runMigrations = () =>
  migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
