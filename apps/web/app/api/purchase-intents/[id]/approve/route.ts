import { NextResponse } from "next/server";
import { getStore } from "../../../../../lib/store";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const store = getStore();
  if (!store) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  const intent = await store.updatePurchaseIntentStatus(id, "approved");
  if (!intent) {
    return NextResponse.json({ error: "Purchase intent not found." }, { status: 404 });
  }

  return NextResponse.json(intent);
}
