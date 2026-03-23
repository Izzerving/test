import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionByToken } from "@/lib/server/session";

export async function DELETE(_: Request, context: { params: Promise<{ emailId: string }> }) {
  const session = await getSessionByToken();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = await prisma.email.findFirst({
    where: {
      id: (await context.params).emailId,
      mailbox: { userId: session.userId }
    },
    select: { id: true }
  });

  if (!email) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  await prisma.email.delete({ where: { id: email.id } });
  return NextResponse.json({ ok: true });
}
