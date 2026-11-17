import { jwtVerify, SignJWT } from "jose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type AuthContext = { userId: string; workspaceId: string };

function getSecret() {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET not set");
  return new TextEncoder().encode(s);
}

/** Sign a 30-day JWT for mobile clients. */
export async function signMobileToken(payload: AuthContext & { email: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

/** Verify a mobile bearer token and return its payload. */
export async function verifyMobileToken(token: string): Promise<AuthContext | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const { userId, workspaceId } = payload as Record<string, unknown>;
    if (typeof userId === "string" && typeof workspaceId === "string") {
      return { userId, workspaceId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Unified auth for API routes — accepts either a NextAuth session cookie (web)
 * or an Authorization: Bearer <token> header (mobile).
 */
export async function getAuthContext(req: Request): Promise<AuthContext | null> {
  // 1. NextAuth session (web)
  const session = await getServerSession(authOptions);
  if (session?.user?.id && session?.user?.workspaceId) {
    return { userId: session.user.id, workspaceId: session.user.workspaceId };
  }

  // 2. Bearer token (mobile)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return verifyMobileToken(authHeader.slice(7));
  }

  return null;
}

export type AuthUser = { userId: string; workspaceId: string | null };

/**
 * Auth for the workspace setup routes, where the caller is signed in but may not
 * belong to a workspace yet. getAuthContext() requires a workspace, so a newly
 * registered user was rejected with 401 when trying to create or join one.
 */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return { userId: session.user.id, workspaceId: session.user.workspaceId ?? null };
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return verifyMobileToken(authHeader.slice(7));
  }

  return null;
}
