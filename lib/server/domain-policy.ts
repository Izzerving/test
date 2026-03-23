const SERVICE_WEB_DOMAIN = (process.env.NEXT_PUBLIC_APP_DOMAIN || "www.time-email.com").toLowerCase();

export function normalizeDomain(input: string) {
  return input.trim().toLowerCase();
}

export function isServiceWebDomain(domain: string) {
  return normalizeDomain(domain) === SERVICE_WEB_DOMAIN;
}

export function assertIssuanceDomain(domain: string) {
  const normalized = normalizeDomain(domain);
  if (isServiceWebDomain(normalized)) {
    throw new Error("Service web domain is forbidden for mailbox issuance");
  }
  return normalized;
}
