// Aspire TypeScript AppHost
// For more information, see: https://aspire.dev

import { createBuilder } from "./.aspire/modules/aspire.mjs";

const builder = await createBuilder();

// Credentials and port match docker-compose.yml, so apps/api/.env and drizzle-kit
// keep working against this container without a second DATABASE_URL.
const userName = await builder.addParameter("pg-user", { value: "wg" });
const password = await builder.addParameter("pg-password", { value: "wg", secret: true });

// 17-alpine to match docker-compose.yml; Aspire's default is 18.x, and prod is 16
// (docs/deploy.md). Changing this major needs the data volume recreated: a 17 binary
// cannot read an 18 data directory.
const postgres = await builder.addPostgres("postgres", { port: 5434, userName, password });
await postgres.withImageTag("17-alpine");
await postgres.withDataVolume();
const db = await postgres.addDatabase("wg");

// install: false — this is a Bun workspace; `workspace:*` deps only resolve from a root
// `bun install`, so a per-app install hangs. Root install already populates node_modules.
const api = await builder.addJavaScriptApp("api", "../apps/api", { runScriptName: "dev" });
await api.withBun({ install: false });
await api.withHttpEndpoint({ port: 4000, env: "PORT" });
await api.withEnvironment("DATABASE_URL", await db.uriExpression());
await api.waitFor(db);

// Port pinned to 3000: Next's rewrites and WEB_ORIGIN / Clerk authorizedParties assume it.
// isProxied: false so Next itself binds 3000 (on every interface) instead of DCP proxying
// localhost:3000 to a random Next port — phones and tablets at the table need the LAN address.
const web = await builder.addNextJsApp("web", "../apps/web", { runScriptName: "dev" });
await web.withBun({ install: false });
await web.withHttpEndpoint({ port: 3000, targetPort: 3000, env: "PORT", isProxied: false });
await web.waitFor(api);

await builder.build().run();
