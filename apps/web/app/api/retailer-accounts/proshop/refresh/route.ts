import { NextResponse } from "next/server";
import { nowIso } from "@proshopper/core/web";
import { getStore } from "../../../../../lib/store";

export async function POST() {
  const store = getStore();
  if (!store) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const account = await store.getRetailerAccount("proshop");
  if (!account) {
    return NextResponse.json({ error: "No Proshop account found." }, { status: 404 });
  }

  const updated = {
    ...account,
    status: "connected" as const,
    lastVerifiedAt: nowIso(),
    updatedAt: nowIso(),
  };
  await store.upsertRetailerAccount(updated);
  return NextResponse.json(updated);
}
