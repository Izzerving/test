import { NextResponse } from "next/server";
import { isServiceWebDomain } from "@/lib/server/domain-policy";
import { generateReadableLocalPart } from "@/lib/server/mailbox-localpart";

// IMPORTANT: service primary domain www.time-email.com MUST NOT be used for mailbox generation.
const FREE_DOMAINS = [
  "mail-free-1.time-email.net",
  "mail-free-2.time-email.net",
  "mail-free-3.time-email.net",
  "mail-free-4.time-email.net",
  "mail-free-5.time-email.net"
].filter((d) => !isServiceWebDomain(d));

export async function POST() {
  if (!FREE_DOMAINS.length) {
    return NextResponse.json({ error: "No mailbox domains configured" }, { status: 500 });
  }
  const domain = FREE_DOMAINS[Math.floor(Math.random() * FREE_DOMAINS.length)];
  const mailbox = `${generateReadableLocalPart()}@${domain}`;
  return NextResponse.json({ mailbox, expiresInMinutes: 30 });
}
