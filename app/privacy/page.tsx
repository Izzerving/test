import { Card } from "@/components/ui/card";

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Privacy Policy (RU)</h1>
      <Card>
        <div className="space-y-3 text-sm text-muted">
          <p>1. Сервис не использует рекламные трекеры, third-party analytics и fingerprinting.</p>
          <p>2. Авторизация только по ключу. Логин/пароль/email для входа не используются.</p>
          <p>3. После logout и/или ручной очистки логов все сессии, IP и UA очищаются без исключений.</p>
          <p>4. По истечении срока mailbox и писем данные удаляются безвозвратно (hard-delete).</p>
          <p>5. Удаление аккаунта пользователем уничтожает связанные данные профиля, ящиков, писем, сессий и платежей.</p>
          <p>6. Данные платежей используются только для обработки транзакций и защиты от fraud/replay.</p>
        </div>
      </Card>
    </main>
  );
}
