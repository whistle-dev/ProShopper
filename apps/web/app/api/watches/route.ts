import { NextResponse } from "next/server";
import { buildWatchSpec, parseWatchRequest } from "../../../lib/watchs";
import { getDashboardData, getStore } from "../../../lib/store";

export async function GET() {
  const store = getStore();
  if (!store) {
    const data = await getDashboardData();
    return NextResponse.json(data.watches);
  }

  const watches = await store.listWatches();
  return NextResponse.json(watches);
}

export async function POST(request: Request) {
  const store = getStore();
  if (!store) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const payload = parseWatchRequest(await request.json());
  const watch = buildWatchSpec(payload);
  await store.upsertWatch(watch);
  return NextResponse.json(watch, { status: 201 });
}
