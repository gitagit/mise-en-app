import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/mobile-auth";
import { z } from "zod";

// POST: join a workspace via invite code
export async function POST(req: Request) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (auth.workspaceId) {
    return NextResponse.json({ error: "Already in a workspace" }, { status: 409 });
  }

  const body = await req.json();
  const parsed = z.object({ code: z.string().min(1) }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const invite = await prisma.workspaceInvite.findUnique({
    where: { code: parsed.data.code },
  });

  if (!invite) return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  if (invite.usedAt) return NextResponse.json({ error: "Invite already used" }, { status: 410 });
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: "Invite expired" }, { status: 410 });

  await prisma.$transaction([
    prisma.workspaceMember.create({
      data: { workspaceId: invite.workspaceId, userId: auth.userId, role: "MEMBER" },
    }),
    prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ workspaceId: invite.workspaceId });
}
