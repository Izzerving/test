import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "AnonKeyMail",
  description: "Privacy-first temporary email service",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [techWorks, cookieStore, headerStore] = await Promise.all([
    prisma.globalSetting.findUnique({ where: { key: "tech_works" } }),
    cookies(),
    headers(),
  ]);

  const showMaintenance = techWorks?.value === "true";
  const adminSuperKey = process.env.ADMIN_SUPER_KEY;
  const adminCookie = cookieStore.get("akm_admin")?.value;
  const adminHeader = headerStore.get("x-admin-key");
  const pathname =
    headerStore.get("x-pathname") ||
    headerStore.get("next-url") ||
    headerStore.get("referer") ||
    "";
  const hasAdminAccess =
    !!adminSuperKey &&
    (adminCookie === adminSuperKey || adminHeader === adminSuperKey);
  const isAdminPath = pathname.includes("/admin");
  const blockForMaintenance = showMaintenance && !hasAdminAccess && !isAdminPath;

  return (
    <html lang="ru" className="dark">
      <body>
        {blockForMaintenance ? (
          <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
            <div className="w-full max-w-2xl rounded-2xl border border-amber-700 bg-amber-950/70 p-8 text-center">
              <p className="text-sm uppercase tracking-[0.24em] text-amber-300">
                Maintenance mode
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-amber-50">
                Технические работы
              </h1>
              <p className="mt-4 text-sm text-amber-100">
                Публичная часть AnonKeyMail временно недоступна. Пожалуйста,
                попробуйте снова позже.
              </p>
            </div>
          </main>
        ) : (
          <>
            {showMaintenance ? (
              <div className="border-b border-amber-700 bg-amber-950 px-4 py-3 text-center text-sm text-amber-100">
                Технические работы: часть функций может быть временно недоступна.
              </div>
            ) : null}
            {children}
          </>
        )}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
