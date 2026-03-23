import AuthClient from "./auth-client";

export default async function AuthPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const referralCode =
    typeof params.ref === "string"
      ? params.ref.trim().toUpperCase()
      : undefined;

  return <AuthClient referralCode={referralCode} />;
}
