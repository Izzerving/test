import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";
import { canAccessArchivedMailbox } from "@/lib/server/domain-service";

export async function GET(_: Request, context: { params: Promise<{ mailboxId: string }> }) {
  const session = await getSessionByToken();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mailbox = await prisma.mailbox.findFirst({
    where: { id: (await context.params).mailboxId, userId: session.userId },
    select: {
      id: true,
      deletedAt: true,
      domain: { select: { status: true } }
    }
  });

  if (!mailbox) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  if (!canAccessArchivedMailbox({ domainStatus: mailbox.domain.status, mailboxDeletedAt: mailbox.deletedAt })) {
    return NextResponse.json({ error: "Mailbox deleted permanently" }, { status: 410 });
  }

  const emails = await prisma.email.findMany({
    where: { mailboxId: mailbox.id },
    orderBy: { receivedAt: "desc" },
    take: 200,
    select: {
      id: true,
      fromAddress: true,
      subject: true,
      textBody: true,
      htmlBody: true,
      receivedAt: true
    }
  });

  return NextResponse.json({ emails });
}
