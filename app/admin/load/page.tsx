import { requireAdminPage } from "@/lib/server/admin";
import LoadClient from "./load-client";

export default async function AdminLoadPage() {
  await requireAdminPage();
  return <LoadClient />;
}
