# AnonKeyMail

> ⚠️ **Warning:** Это Beta-версия. Данные могут быть удалены. Не используйте для важной почты.

Privacy-first temporary email platform на стеке **Next.js 15 + Prisma + PostgreSQL + Redis + Postfix**.

## Содержание
- [Быстрый старт (Docker Compose)](#быстрый-старт-docker-compose)
- [Переменные окружения (.env.example)](#переменные-окружения-envexample)
- [Полезные команды](#полезные-команды)
- [Как развернуть в продакшен (VPS + Cloudflare)](#как-развернуть-в-продакшен-vps--cloudflare)
- [Deploy on VPS (Hetzner/DO)](#deploy-on-vps-hetznerdo)
- [Документация](#документация)

---

## Быстрый старт (Docker Compose)

### 1) Требования
- Docker Engine 24+
- Docker Compose v2+

Проверка:
```bash
docker --version
docker compose version
```

### 2) Клонирование и настройка
```bash
git clone https://github.com/Izzerving/email.git
cd email
cp .env.example .env
```

### 3) Запуск
```bash
docker compose up -d --build
# production profile с reverse-proxy
# docker compose --profile production up -d --build
```

После старта:
- Web/API: `http://localhost:3000`
- Health-check: `http://localhost:3000/api/health`

Проверка контейнеров:
```bash
docker compose ps
```

Проверка health:
```bash
curl -sS http://localhost:3000/api/health | jq
```

### 4) Остановка
```bash
docker compose down
```

### 5) Обновление
```bash
git pull
docker compose up -d --build
```

---

## Переменные окружения (.env.example)

Ниже полный список переменных из `.env.example`:

```env
# Core runtime
NODE_ENV="production"
APP_URL="https://www.time-email.com"
LOG_LEVEL="info"

# Database / Redis
DATABASE_URL="postgresql://anonkeymail:anonkeymail@postgres:5432/anonkeymail"
REDIS_URL="redis://redis:6379"
POSTGRES_USER="anonkeymail"
POSTGRES_PASSWORD="change_postgres_password"
POSTGRES_DB="anonkeymail"

# Public app metadata
NEXT_PUBLIC_APP_NAME="AnonKeyMail"
NEXT_PUBLIC_APP_DOMAIN="www.time-email.com"
PRIMARY_MAIL_DOMAIN="mail-free-1.time-email.net"

# Security / auth
ADMIN_SUPER_KEY="change_admin_super_key"
INGEST_API_KEY="change_ingest_secret"
GUEST_COOKIE_SECRET="change_guest_secret"
PRIVACY_LOG_MODE="strict"

# Realtime / workers
REALTIME_PORT="3001"
POSTFIX_SYNC_INTERVAL_SECONDS="30"
CLEANUP_INTERVAL_MS="300000"
CLEANUP_SESSION_MAX_AGE_MS="2592000000"
HEALTH_STRICT_MODE="false"
HEALTHCHECK_POSTFIX_REQUIRED="false"
HEALTHCHECK_REALTIME_REQUIRED="false"

# Payments
TELEGRAM_BOT_TOKEN=""
TELEGRAM_STARS_PROVIDER_TOKEN=""
CRYPTOBOT_MERCHANT_TOKEN=""
CRYPTOBOT_WEBHOOK_SECRET=""
STARS_WEBHOOK_SECRET=""
MONERO_RPC_URL=""
MONERO_RPC_LOGIN=""
MONERO_RPC_PASSWORD=""
MONERO_PRIMARY_ADDRESS=""

# Cloudflare (DNS / API automation / zone settings)
CLOUDFLARE_API_TOKEN=""
CLOUDFLARE_ZONE_ID=""
CLOUDFLARE_ACCOUNT_ID=""
CLOUDFLARE_EMAIL=""
CLOUDFLARE_DOMAIN="time-email.com"
CLOUDFLARE_PROXIED="true"
```

### Минимум для dev-запуска
- `DATABASE_URL`
- `REDIS_URL`
- `ADMIN_SUPER_KEY`
- `INGEST_API_KEY`
- `GUEST_COOKIE_SECRET`

---

## Полезные команды

```bash
# Логи всех сервисов
docker compose logs -f --tail=200

# Логи только app
docker compose logs -f app

# Перезапуск одного сервиса
docker compose restart app

# Полная пересборка
docker compose up -d --build --force-recreate
```

---

## Как развернуть в продакшен (VPS + Cloudflare)

### 1) VPS baseline
Рекомендуется:
- Ubuntu 22.04/24.04 LTS
- 2+ vCPU, 4+ GB RAM, SSD
- Отдельный пользователь (не root) для деплоя
- UFW + fail2ban

Открытые порты:
- `22` (SSH)
- `80` (HTTP)
- `443` (HTTPS)
- Не публиковать наружу PostgreSQL/Redis напрямую.

### 2) Деплой приложения
```bash
git clone https://github.com/Izzerving/email.git
cd email
cp .env.example .env
# заполнить прод-значения

docker compose --profile production up -d --build
```

### 3) Reverse proxy + TLS
Рекомендуется поставить Nginx/Caddy перед `app:3000`:
- терминация TLS на прокси,
- редирект HTTP -> HTTPS,
- security headers,
- rate limiting для публичных endpoint’ов.

### 4) Cloudflare (рекомендуемый минимум)
- Включить **Proxy (orange cloud)** для домена.
- SSL/TLS режим: **Full (strict)**.
- Включить WAF managed rules.
- Включить Bot Fight Mode / Super Bot Fight Mode (если доступно).
- Настроить rate limits для:
  - `/api/ingest/email`
  - `/api/auth/*`
  - `/api/payments/*`

### 5) Прод-рекомендации
- Секреты только через `.env`/vault, никогда не коммитить.
- Регулярные бэкапы PostgreSQL + проверка восстановления.
- Мониторинг `GET /api/health` и алерты по 5xx.
- Отдельные домены/поддомены для web и mail-пула.
- Privacy-first режим не использует сторонние error-tracking сервисы по умолчанию.
- Для reverse-proxy используй шаблон `nginx.conf.example`.

---

## Deploy on VPS (Hetzner/DO)

1. Подготовь Ubuntu 22.04/24.04, установи Docker + Compose.
2. Открой только `22/80/443`, закрой прямой доступ к `5432/6379`.
3. Клонируй проект и создай `.env`:
   ```bash
   git clone https://github.com/Izzerving/email.git
   cd email
   cp .env.example .env
   ```
4. Настрой `nginx.conf.example` (домен, SSL-сертификаты) и смонтируй certs в `./certs`.
5. Запусти production профиль:
   ```bash
   docker compose --profile production up -d --build
   ```
6. Для обновлений используй скрипт:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```
7. Проверка:
   ```bash
   curl -sS https://YOUR_DOMAIN/api/health
   docker compose ps
   ```

---

## Реферальная система

- `$5` за регистрацию приглашённого друга.
- `10%` от каждого подтверждённого платежа друга начисляется рефереру.
- Вывод доступен от `$50` на Monero и подтверждается администратором вручную.

---

## Документация

- ТЗ (полный документ): [`docs/FULL_TZ_RU.md`](docs/FULL_TZ_RU.md)
- Privacy policy: [`docs/PRIVACY_POLICY_RU.md`](docs/PRIVACY_POLICY_RU.md)
- План/аудит выполнения: [`docs/TZ_EXECUTION_AUDIT_AND_PLAN_RU.md`](docs/TZ_EXECUTION_AUDIT_AND_PLAN_RU.md)

---

Если делаешь first-time setup — начни с `docker compose up -d --build`, потом сразу проверь `GET /api/health`.
