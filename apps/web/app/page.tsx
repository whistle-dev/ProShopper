import { DashboardClient } from "../components/dashboard-client";
import { getDashboardData } from "../lib/store";

export default async function Page() {
  const data = await getDashboardData();
  return <DashboardClient initialData={data} />;
}
