import ReferralsClient from "./referrals-client";
import { requireAdminPage } from "@/lib/server/admin";

export default async function AdminReferralsPage() {
  await requireAdminPage();
  return <ReferralsClient />;
}
