const crypto = require("crypto");
const {
  PrismaClient,
  DomainTier,
  DomainStatus,
  Tier,
  DeletionInterval
} = require("@prisma/client");

const prisma = new PrismaClient();

// IMPORTANT: www.time-email.com is service web domain only, not mailbox issuance domain.
const freeDomains = [
  "mail-free-1.time-email.net",
  "mail-free-2.time-email.net",
  "mail-free-3.time-email.net",
  "mail-free-4.time-email.net",
  "mail-free-5.time-email.net"
];
const premiumDomains = Array.from({ length: 20 }, (_, i) => `mail-prem-${i + 1}.time-email.net`);
const unlimitedDomains = Array.from({ length: 20 }, (_, i) => `mail-unl-${i + 1}.time-email.net`);

const referralSeedUsers = [
  {
    publicId: "seed-referrer-alpha",
    referralCode: "REF-ALPHA-2026",
    keyPlaintext: "seed-referral-alpha-key"
  },
  {
    publicId: "seed-referrer-beta",
    referralCode: "REF-BETA-2026",
    keyPlaintext: "seed-referral-beta-key"
  }
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function seedPool(names, tier) {
  for (const name of names) {
    await prisma.domain.upsert({
      where: { name },
      update: { tier, status: DomainStatus.active },
      create: { name, tier, status: DomainStatus.active }
    });
  }
}

async function seedReferralCodes() {
  const deleteAt = new Date("2030-01-01T00:00:00.000Z");

  for (const seedUser of referralSeedUsers) {
    const keyHash = sha256(seedUser.keyPlaintext);
    const keyLookupHash = sha256(`${seedUser.keyPlaintext}:lookup`);

    await prisma.user.upsert({
      where: { publicId: seedUser.publicId },
      update: {
        referralCode: seedUser.referralCode,
        keyHash,
        keyLookupHash,
        keyShownAt: new Date(),
        deleteAt,
        tier: Tier.FREE_KEY,
        deletionInterval: DeletionInterval.D30
      },
      create: {
        publicId: seedUser.publicId,
        referralCode: seedUser.referralCode,
        tier: Tier.FREE_KEY,
        keyHash,
        keyLookupHash,
        keyShownAt: new Date(),
        deletionInterval: DeletionInterval.D30,
        deleteAt
      }
    });
  }
}

async function main() {
  await seedPool(freeDomains, DomainTier.FREE);
  await seedPool(premiumDomains, DomainTier.PREMIUM);
  await seedPool(unlimitedDomains, DomainTier.UNLIMITED);

  const globalSettings = [
    {
      key: "tech_works",
      value: "false",
      description: "Maintenance mode toggle for the public application"
    },
    {
      key: "telegram_support",
      value: "https://t.me/your_support",
      description: "Support contact link displayed in the UI"
    },
    {
      key: "manual_monero_wallet",
      value: "",
      description: "Fallback wallet address for manual Monero payments"
    },
    {
      key: "min_withdrawal_usd",
      value: "50",
      description: "Minimum withdrawal amount in USD for referral payouts"
    }
  ];

  for (const setting of globalSettings) {
    await prisma.globalSetting.upsert({
      where: { key: setting.key },
      update: {
        value: setting.value,
        description: setting.description
      },
      create: setting
    });
  }

  await seedReferralCodes();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
