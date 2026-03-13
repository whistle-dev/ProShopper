import { NextResponse } from "next/server";
import { getStore } from "../../../../../lib/store";

export async function POST() {
  const store = getStore();
  if (!store) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  await store.disconnectRetailerAccount("proshop");
  return NextResponse.json({ ok: true });
}
