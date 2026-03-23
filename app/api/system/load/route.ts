import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ cpu: 42, ram: 65, disk: 78 });
}
