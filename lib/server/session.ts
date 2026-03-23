import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/server/auth";

export async function getSessionByToken(inputToken?: string) {
  const cookieStore = await cookies();
  const token = inputToken || cookieStore.get("akm_token")?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true }
  });

  if (!session) return null;

  if (session.user.deletedAt) {
    await prisma.session.deleteMany({ where: { userId: session.userId } });
    return null;
  }

  return session;
}
