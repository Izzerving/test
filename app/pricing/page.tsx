import type { Metadata } from "next";
export const metadata: Metadata = { title: "Pricing - AnonKeyMail", description: "Free, Premium and Unlimited pricing" };
export default function Page(){ return <main className="mx-auto min-h-screen max-w-4xl p-6"><h1 className="text-2xl font-semibold">Pricing</h1><div className="mt-3 grid gap-3 md:grid-cols-3 text-sm"><div className="rounded border p-3">Free</div><div className="rounded border p-3">Premium</div><div className="rounded border p-3">Unlimited</div></div></main>; }
