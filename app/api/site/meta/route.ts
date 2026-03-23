import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const settings = await prisma.globalSetting.findMany({ where: { key: { in: ["telegram_support", "tech_works"] } } });
  const map = new Map(settings.map((item) => [item.key, item.value]));
  return NextResponse.json({
    telegramSupport: map.get("telegram_support") || "",
    techWorks: map.get("tech_works") === "true"
  });
}
