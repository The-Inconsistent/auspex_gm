import { API_ORIGIN, type JoinError } from "@/app/constants";

type JoinContext = { params: Promise<{ token: string }> };

// Relative Location, so the redirect stays on whatever host the phone used (Caddy in prod, :3000 in dev).
const redirectHome = (search = "") => new Response(null, { status: 303, headers: { location: `/${search}` } });
const redirectError = (error: JoinError) => redirectHome(`?join=${error}`);

// GM link or player QR lands here: trade the token for the api's httpOnly cookie, then go to the table.
export async function GET(_request: Request, { params }: JoinContext) {
  const { token } = await params;
  let res: Response;
  try {
    res = await fetch(`${API_ORIGIN}/api/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
  } catch {
    return redirectError("nosignal");
  }
  // Only a rejected token is "invalid"; a 5xx is the api's fault and the link may be fine.
  if (res.status === 400 || res.status === 401) return redirectError("invalid");
  if (!res.ok) return redirectError("nosignal");

  const response = redirectHome();
  for (const cookie of res.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
  return response;
}
