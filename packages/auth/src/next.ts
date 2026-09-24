/// <reference path="../type.d.ts" />
import { auth, clerkMiddleware } from "@clerk/nextjs/server";

// Next server side of Clerk: the proxy's session handling, and who is signed in on this request.
export const authMiddleware = clerkMiddleware;

export const signedInUserId = async () => (await auth()).userId;

// The caller's session token, for forwarding to the api as a Bearer header (api.ts verifies it).
export const sessionToken = async () => (await auth()).getToken();
