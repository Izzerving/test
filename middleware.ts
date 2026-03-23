import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { installGlobalErrorHandlers } from "@/lib/server/observability";

// 🔥 Глобальные обработчики ошибок + Sentry (обязательно по senior-промпту)
// Должны вызываться САМЫМИ ПЕРВЫМИ
installGlobalErrorHandlers();

const protectedPaths = ["/dashboard", "/api/auth/me", "/api/auth/sessions", "/api/auth/deletion-policy", "/api/mailboxes"];
const adminPaths = ["/admin", "/api/admin"];


export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsSession = protectedPaths.some((p) => pathname.startsWith(p));
  const needsAdmin = adminPaths.some((p) => pathname.startsWith(p));

  if (needsSession) {
    const token = request.cookies.get("akm_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (pathname === "/admin/auth") {
    return NextResponse.next();
  }

  if (needsAdmin) {
    const adminHeader = request.headers.get("x-admin-key");
    const adminCookie = request.cookies.get("akm_admin")?.value;
    const adminOk = !!process.env.ADMIN_SUPER_KEY && (adminHeader === process.env.ADMIN_SUPER_KEY || adminCookie === process.env.ADMIN_SUPER_KEY);

    if (!adminOk) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/admin/auth", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/:path*"]
};
