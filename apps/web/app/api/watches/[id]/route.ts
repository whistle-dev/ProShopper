import { NextResponse } from "next/server";
import { buildWatchSpec, parseWatchRequest } from "../../../../lib/watchs";
import { getStore } from "../../../../lib/store";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const store = getStore();
  if (!store) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  const existing = await store.getWatchById(id);
  if (!existing) {
    return NextResponse.json({ error: "Watch not found." }, { status: 404 });
  }

  const payload = parseWatchRequest(await request.json());
  const watch = buildWatchSpec({ ...payload, id }, existing);
  await store.upsertWatch(watch);
  return NextResponse.json(watch);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const store = getStore();
  if (!store) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  await store.deleteWatch(id);
  return new NextResponse(null, { status: 204 });
}
