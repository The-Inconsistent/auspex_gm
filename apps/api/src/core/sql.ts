import { sql, type AnyColumn } from "drizzle-orm";
import { text, timestamp } from "drizzle-orm/pg-core";

// Counters never drop below 0.
export const bump = (col: AnyColumn, d: number | undefined) => (d === undefined ? undefined : sql`greatest(0, ${col} + ${d})`);

// Column builders shared by several feature schemas.
export const conditions = () => text().array().notNull().default(sql`'{}'::text[]`);
export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const body = () => text().notNull().default("");
