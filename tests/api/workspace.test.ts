// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getServerSession, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    workspace: { create: vi.fn(), findUnique: vi.fn() },
    userPreferences: { create: vi.fn() },
    workspaceInvite: { findUnique: vi.fn(), update: vi.fn() },
    workspaceMember: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/db", () => ({ prisma }));

import { POST as createWorkspace, GET as getWorkspace } from "@/app/api/workspace/route";
import { POST as joinWorkspace } from "@/app/api/workspace/join/route";

function post(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const signedInNoWorkspace = { user: { id: "user_1", email: "new@example.com", workspaceId: null } };
const signedInWithWorkspace = { user: { id: "user_1", email: "a@example.com", workspaceId: "ws_1" } };

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
  getServerSession.mockReset();
  for (const model of Object.values(prisma)) {
    if (typeof model === "function") model.mockReset();
    else for (const fn of Object.values(model)) fn.mockReset();
  }
});

describe("POST /api/workspace", () => {
  it("lets a signed-in user with no workspace create one (regression: used to return 401)", async () => {
    getServerSession.mockResolvedValue(signedInNoWorkspace);
    prisma.workspace.create.mockResolvedValue({ id: "ws_new" });

    const res = await createWorkspace(post("http://localhost/api/workspace", { name: "  My Kitchen " }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workspaceId: "ws_new" });
    expect(prisma.workspace.create).toHaveBeenCalledWith({
      data: { name: "My Kitchen", members: { create: { userId: "user_1", role: "OWNER" } } },
    });
    expect(prisma.userPreferences.create).toHaveBeenCalledWith({ data: { workspaceId: "ws_new" } });
  });

  it("rejects a signed-out caller with 401", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await createWorkspace(post("http://localhost/api/workspace", { name: "x" }));
    expect(res.status).toBe(401);
    expect(prisma.workspace.create).not.toHaveBeenCalled();
  });

  it("rejects a caller who already has a workspace with 409", async () => {
    getServerSession.mockResolvedValue(signedInWithWorkspace);
    const res = await createWorkspace(post("http://localhost/api/workspace", { name: "x" }));
    expect(res.status).toBe(409);
    expect(prisma.workspace.create).not.toHaveBeenCalled();
  });

  it("rejects an empty name with 400", async () => {
    getServerSession.mockResolvedValue(signedInNoWorkspace);
    const res = await createWorkspace(post("http://localhost/api/workspace", { name: "" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/workspace", () => {
  it("still requires a workspace", async () => {
    getServerSession.mockResolvedValue(signedInNoWorkspace);
    const res = await getWorkspace(new Request("http://localhost/api/workspace"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/workspace/join", () => {
  it("lets a signed-in user with no workspace join by invite code (same 401 bug)", async () => {
    getServerSession.mockResolvedValue(signedInNoWorkspace);
    prisma.workspaceInvite.findUnique.mockResolvedValue({
      id: "inv_1", workspaceId: "ws_9", usedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.$transaction.mockResolvedValue([]);

    const res = await joinWorkspace(post("http://localhost/api/workspace/join", { code: "abc" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workspaceId: "ws_9" });
    expect(prisma.workspaceMember.create).toHaveBeenCalledWith({
      data: { workspaceId: "ws_9", userId: "user_1", role: "MEMBER" },
    });
  });

  it("rejects an expired invite with 410", async () => {
    getServerSession.mockResolvedValue(signedInNoWorkspace);
    prisma.workspaceInvite.findUnique.mockResolvedValue({
      id: "inv_1", workspaceId: "ws_9", usedAt: null, expiresAt: new Date(Date.now() - 60_000),
    });
    const res = await joinWorkspace(post("http://localhost/api/workspace/join", { code: "abc" }));
    expect(res.status).toBe(410);
  });

  it("rejects a signed-out caller with 401", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await joinWorkspace(post("http://localhost/api/workspace/join", { code: "abc" }));
    expect(res.status).toBe(401);
  });
});
