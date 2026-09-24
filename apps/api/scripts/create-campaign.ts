// Usage: bun scripts/create-campaign.ts "Volkus Dig Site" 4
// Creates a campaign on the running api (ADMIN_KEY from .env) and prints the GM's join link.
const [name, tier = "1"] = process.argv.slice(2);
if (!name) throw new Error('Usage: bun scripts/create-campaign.ts "<name>" <tier 1-5>');

const api = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
const res = await fetch(`${api}/api/campaigns`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-admin-key": process.env.ADMIN_KEY ?? "" },
  body: JSON.stringify({ name, tier: Number(tier) }),
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const { gmToken } = (await res.json()) as { gmToken: string };
console.log(`GM link: ${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/join/${gmToken}`);
