import type { NextRequest } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export async function requireAdminPage() {
  const adminSuperKey = process.env.ADMIN_SUPER_KEY;
  const cookieStore = await cookies();
  const headerStore = await headers();
  const adminCookie = cookieStore.get("akm_admin")?.value;
  const adminHeader = headerStore.get("x-admin-key");
  const adminOk = !!adminSuperKey && (adminCookie === adminSuperKey || adminHeader === adminSuperKey);

  if (!adminOk) {
    redirect("/admin/auth");
  }
}

export function requestHasAdminAccess(request: NextRequest) {
  const adminSuperKey = process.env.ADMIN_SUPER_KEY;
  if (!adminSuperKey) return false;

  const adminHeader = request.headers.get("x-admin-key");
  const cookieHeader = request.cookies.get("akm_admin")?.value;
  return adminHeader === adminSuperKey || cookieHeader === adminSuperKey;
}
