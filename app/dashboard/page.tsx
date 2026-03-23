import { redirect } from "next/navigation";
import DashboardClient from "./dashboard-client";
import { getSessionByToken } from "@/lib/server/session";

export default async function DashboardPage() {
  const session = await getSessionByToken();

  if (!session) {
    redirect("/auth");
  }

  return <DashboardClient />;
}
