export type AppLang = "ru" | "en" | "zh" | "de";

export const supportedLangs: AppLang[] = ["ru", "en", "zh", "de"];

export const langLabels: Record<AppLang, string> = {
  ru: "Русский",
  en: "English",
  zh: "中文",
  de: "Deutsch"
};

export function resolveLang(input?: string | null): AppLang {
  if (!input) return "ru";
  const raw = input.toLowerCase();
  if (raw.startsWith("en")) return "en";
  if (raw.startsWith("zh")) return "zh";
  if (raw.startsWith("de")) return "de";
  return "ru";
}

export function formatDateTimeWithUtc(iso: string, lang: AppLang) {
  const local = new Date(iso).toLocaleString(lang);
  const utc = new Date(iso).toISOString().replace("T", " ").replace(".000Z", " UTC");
  return { local, utc };
}
