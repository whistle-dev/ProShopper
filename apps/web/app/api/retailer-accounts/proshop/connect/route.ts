import { NextResponse } from "next/server";
import { nowIso, type RetailerAccount } from "@proshopper/core/web";
import { z } from "zod";
import { getStore } from "../../../../../lib/store";

const connectPayloadSchema = z.object({
  label: z.string().min(1).default("Primary Proshop account"),
  sessionState: z.string().min(20),
  sessionMeta: z.record(z.string(), z.unknown()).optional(),
});

function isAuthorized(request: Request) {
  const expectedToken = process.env.CONNECT_API_TOKEN;
  if (!expectedToken) {
    return true;
  }

  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${expectedToken}`;
}

export async function POST(request: Request) {
  const store = getStore();
  if (!store) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = connectPayloadSchema.parse(await request.json());
  const timestamp = nowIso();
  const account: RetailerAccount = {
    id: crypto.randomUUID(),
    retailer: "proshop",
    label: payload.label,
    status: "connected",
    encryptedSessionState: payload.sessionState,
    ...(payload.sessionMeta ? { sessionMeta: payload.sessionMeta } : {}),
    connectedAt: timestamp,
    lastVerifiedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await store.upsertRetailerAccount(account);
  return NextResponse.json(account, { status: 201 });
}
