import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as authSchema from "../auth/auth.schema.ts";
import * as campaignSchema from "../campaign/campaign.schema.ts";
import * as characterSchema from "../character/character.schema.ts";
import * as codexSchema from "../codex/codex.schema.ts";
import * as encounterSchema from "../encounter/encounter.schema.ts";
import * as librarySchema from "../library/library.schema.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const schema = {
  ...authSchema,
  ...campaignSchema,
  ...characterSchema,
  ...codexSchema,
  ...encounterSchema,
  ...librarySchema,
};

export const db = drizzle(process.env.DATABASE_URL, { schema, casing: "snake_case" });
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
// Either the pool or an open transaction: for reads that also run inside actions.
export type Db = typeof db | Tx;

export const runMigrations = () =>
  migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
