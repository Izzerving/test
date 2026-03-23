import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guestCookieName, verifyGuestToken } from "@/lib/server/guest-session";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(guestCookieName())?.value;
  if (!token) return NextResponse.json({ mailbox: null, emails: [] });

  const parsed = verifyGuestToken(token);
  if (!parsed) return NextResponse.json({ mailbox: null, emails: [] });

  const mailbox = await prisma.mailbox.findUnique({
    where: { id: parsed.mailboxId },
    select: { id: true, address: true, expiresAt: true, isActive: true, isGuest: true }
  });
  if (!mailbox || !mailbox.isGuest) return NextResponse.json({ mailbox: null, emails: [] });

  const emails = await prisma.email.findMany({
    where: { mailboxId: mailbox.id },
    orderBy: { receivedAt: "desc" },
    take: 50,
    select: {
      id: true,
      fromAddress: true,
      subject: true,
      textBody: true,
      htmlBody: true,
      receivedAt: true
    }
  });

  return NextResponse.json({ mailbox, emails });
}
