import type { Metadata } from "next";
export const metadata: Metadata = { title: "Features - AnonKeyMail", description: "Features of temporary mailbox service" };
export default function Page(){ return <main className="mx-auto min-h-screen max-w-4xl p-6"><h1 className="text-2xl font-semibold">Features</h1><ul className="mt-3 list-disc pl-5 text-sm text-muted"><li>Key-only authentication</li><li>Realtime inbox</li><li>Tier/domain limits</li><li>Crypto-first payments</li></ul></main>; }
