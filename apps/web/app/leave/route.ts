import { TOKEN_COOKIE } from "@/app/constants";

// Leave the table on this phone: expire the httpOnly guest cookie (JS can't), then home to the sign-in landing.
// Sign-out redirects here too, so a leftover guest cookie can't bounce the user back into a table.
export function GET() {
  return new Response(null, {
    status: 303,
    headers: { location: "/", "set-cookie": `${TOKEN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` },
  });
}
