import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

const logger = createLogger("api.auth.purge-history");

export async function POST() {
  try {
    const session = await getSessionByToken();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const emailDelete = await prisma.email.deleteMany({
      where: { mailbox: { userId: session.userId } }
    });

    const mailboxDelete = await prisma.mailbox.deleteMany({
      where: { userId: session.userId }
    });

    await prisma.session.deleteMany({
      where: { userId: session.userId }
    });

    return NextResponse.json({
      ok: true,
      deletedEmails: emailDelete.count,
      deletedMailboxes: mailboxDelete.count
    });
  } catch (error) {
    await captureException(error, { path: "/api/auth/purge-history", method: "POST" });
    logger.error("api.auth.purge_history.failed", { path: "/api/auth/purge-history", method: "POST", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
