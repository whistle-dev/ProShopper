import { NextResponse } from "next/server";
import { getDashboardData, getStore } from "../../../lib/store";

export async function GET() {
  const store = getStore();
  if (!store) {
    const data = await getDashboardData();
    return NextResponse.json(data.events);
  }

  const events = await store.listRecentEvents(100);
  return NextResponse.json(events);
}
