import WithdrawalsClient from "./withdrawals-client";
import { requireAdminPage } from "@/lib/server/admin";

export default async function AdminWithdrawalsPage() {
  await requireAdminPage();
  return <WithdrawalsClient />;
}
