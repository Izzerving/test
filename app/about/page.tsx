import type { Metadata } from "next";
export const metadata: Metadata = { title: "About - AnonKeyMail", description: "About privacy-first temporary email service" };
export default function Page(){ return <main className="mx-auto min-h-screen max-w-4xl p-6"><h1 className="text-2xl font-semibold">About</h1><p className="mt-3 text-sm text-muted">AnonKeyMail is a privacy-first temporary mailbox platform for quick, anonymous inbox usage.</p></main>; }
