import { PaymentMethod } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

function withTimeout(ms = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

async function safeJson(res: Response) {
  return res.json().catch(() => null);
}

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is required for production payment flow`);
  }

  return value;
}

async function moneroRpcCall<T>(
  method: string,
  params: Record<string, unknown>,
) {
  const rpcUrl = requireEnv("MONERO_RPC_URL", process.env.MONERO_RPC_URL);
  const rpcLogin = requireEnv("MONERO_RPC_LOGIN", process.env.MONERO_RPC_LOGIN);
  const rpcPassword = requireEnv(
    "MONERO_RPC_PASSWORD",
    process.env.MONERO_RPC_PASSWORD,
  );

  const { controller, done } = withTimeout();
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${rpcLogin}:${rpcPassword}`).toString("base64")}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "0",
        method,
        params,
      }),
      signal: controller.signal,
    });

    const data = await safeJson(res);
    if (!res.ok || data?.error || !data?.result) {
      throw new Error(`Monero RPC ${method} failed`);
    }

    return data.result as T;
  } finally {
    done();
  }
}

export async function createStarsInvoice(amountUsd: number) {
  const botToken = requireEnv(
    "TELEGRAM_BOT_TOKEN",
    process.env.TELEGRAM_BOT_TOKEN,
  );
  const starsProviderToken = requireEnv(
    "TELEGRAM_STARS_PROVIDER_TOKEN",
    process.env.TELEGRAM_STARS_PROVIDER_TOKEN,
  );

  const { controller, done } = withTimeout();
  try {
    const payload = {
      title: "AnonKeyMail Premium",
      description: "Premium upgrade",
      payload: `stars_${Date.now()}`,
      provider_token: starsProviderToken,
      currency: "XTR",
      prices: [
        { label: "Premium", amount: Math.max(1, Math.round(amountUsd * 100)) },
      ],
    };

    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );

    const data = await safeJson(res);
    if (!res.ok || !data?.ok || !data?.result) {
      // No fallback/mocks in production: fallback URLs allow downgrade from verified provider flow to fake/manual flow.
      throw new Error(
        `Telegram Stars createInvoiceLink failed: ${JSON.stringify(data)}`,
      );
    }

    return {
      provider: "stars",
      externalId: payload.payload,
      checkoutUrl: String(data.result),
    };
  } finally {
    done();
  }
}

export async function createCryptoBotInvoice(amountUsd: number) {
  const merchantToken = requireEnv(
    "CRYPTOBOT_MERCHANT_TOKEN",
    process.env.CRYPTOBOT_MERCHANT_TOKEN,
  );

  const { controller, done } = withTimeout();
  try {
    const externalId = `cb_${Date.now()}`;
    const res = await fetch("https://pay.crypt.bot/api/createInvoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Crypto-Pay-API-Token": merchantToken,
      },
      body: JSON.stringify({
        asset: "USDT",
        amount: amountUsd.toFixed(2),
        currency_type: "fiat",
        fiat: "USD",
        description: "AnonKeyMail Premium",
        payload: externalId,
      }),
      signal: controller.signal,
    });

    const data = await safeJson(res);
    if (!res.ok || !data?.ok || !data?.result?.pay_url) {
      // No fallback/mocks in production: fallback links break payment integrity and can be abused for downgrade attacks.
      throw new Error(
        `CryptoBot createInvoice failed: ${JSON.stringify(data)}`,
      );
    }

    return {
      provider: "cryptobot",
      externalId,
      checkoutUrl: String(data.result.pay_url),
    };
  } finally {
    done();
  }
}

export async function createMoneroIntent(amountUsd: number) {
  type MoneroCreateAddressResult = { address: string; address_index: number };
  const created = await moneroRpcCall<MoneroCreateAddressResult>(
    "create_address",
    { account_index: 0 },
  );
  const memo = `xmr_${randomBytes(8).toString("hex")}`;

  // No fallback/mocks in production: always bind payment to real wallet-generated address to prevent fake-crediting flows.
  return {
    provider: "monero",
    externalId: `xmr_addr_${created.address_index}_${Date.now()}`,
    address: created.address,
    memo,
    amountUsd,
  };
}

export function normalizeMethod(method: string): PaymentMethod | null {
  if (method === "TELEGRAM_STARS") return PaymentMethod.TELEGRAM_STARS;
  if (method === "CRYPTOBOT") return PaymentMethod.CRYPTOBOT;
  if (method === "MONERO") return PaymentMethod.MONERO;
  if (method === "MANUAL") return PaymentMethod.MANUAL;
  return null;
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
) {
  if (!secret) return false;
  if (!signature) return false;

  const digest = createHash("sha256")
    .update(`${secret}:${rawBody}`)
    .digest("hex");
  return digest === signature;
}
