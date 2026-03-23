import { NextResponse } from "next/server";
import { PaymentMethod, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { confirmPaymentAndApplyReferral } from "@/lib/server/referrals";
import { captureException, createLogger, getErrorMessage } from "@/lib/server/observability";

type MoneroTransfer = { txid?: string; confirmations?: number; payment_id?: string };
type MoneroGetTransfersResult = { in?: MoneroTransfer[] };

const logger = createLogger("api.payments.monero.check");

function moneroAuthHeaders() {
  const rpcLogin = process.env.MONERO_RPC_LOGIN;
  const rpcPassword = process.env.MONERO_RPC_PASSWORD;
  if (!rpcLogin || !rpcPassword) {
    throw new Error("MONERO_RPC_LOGIN and MONERO_RPC_PASSWORD are required");
  }

  return {
    Authorization: `Basic ${Buffer.from(`${rpcLogin}:${rpcPassword}`).toString("base64")}`
  };
}

async function getIncomingTransfersBySubaddressIndex(subaddressIndex: number) {
  const rpcUrl = process.env.MONERO_RPC_URL;
  if (!rpcUrl) {
    throw new Error("MONERO_RPC_URL is required");
  }

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...moneroAuthHeaders()
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "0",
      method: "get_transfers",
      params: {
        in: true,
        pool: true,
        account_index: 0,
        subaddr_indices: [subaddressIndex]
      }
    })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error || !data?.result) {
    throw new Error("Monero RPC get_transfers failed");
  }

  return data.result as MoneroGetTransfersResult;
}

export async function POST() {
  try {
    if (!process.env.MONERO_RPC_URL) {
      return NextResponse.json({ error: "MONERO_RPC_URL is required" }, { status: 503 });
    }

    const pending = await prisma.payment.findMany({
      where: { method: PaymentMethod.MONERO, status: PaymentStatus.PENDING },
      take: 50
    });

    for (const p of pending) {
      const match = /^xmr_addr_(\d+)_\d+$/.exec(p.externalId || "");
      if (!match) continue;

      const subaddressIndex = Number(match[1]);
      const transferData = await getIncomingTransfersBySubaddressIndex(subaddressIndex);
      const transfers = transferData.in || [];
      const confirmed = transfers.some((t) => (t.confirmations || 0) >= 10);

      if (confirmed) {
        await confirmPaymentAndApplyReferral(p.id);
      }
    }

    return NextResponse.json({ checked: pending.length });
  } catch (error) {
    await captureException(error, { path: "/api/payments/monero/check", method: "POST" });
    logger.error("api.payments.monero_check.failed", { path: "/api/payments/monero/check", method: "POST", error: getErrorMessage(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
