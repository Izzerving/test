#!/usr/bin/env bash
set -euo pipefail

echo "Глубокий фикс Prisma stuck migration (P3009)"
echo "Отключаем миграцию в app → чиним _prisma_migrations → возвращаем нормальный запуск"
echo "Дата: $(date)"
echo ""

# 1. Полная остановка
docker compose --profile production down || true
sleep 3

# 2. Создаём временный compose-файл с отключённой миграцией только для app
cat > docker-compose-temp.yml << '=====END_TEMP_YAML====='
name: anonkeymail

services:
  app:
    build: .
    container_name: anonkeymail-app
    env_file: .env
    restart: unless-stopped
    expose:
      - "3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      HEALTH_STRICT_MODE: "false"
      HEALTHCHECK_POSTFIX_REQUIRED: "false"
      HEALTHCHECK_REALTIME_REQUIRED: "false"
    command: ["sh", "-c", "echo 'Пропускаем prisma migrate для ручного фикса' && npm run start"]
    healthcheck:
      test: ["CMD-SHELL", "wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s
    volumes:
      - app_logs:/app/logs

  worker:
    build: .
    container_name: anonkeymail-worker
    command: ["ts-node", "worker/cleanup.js"]
    env_file: .env
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      realtime:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "node -e \"process.exit(0)\""]
      interval: 15s
      start_period: 30s
    volumes:
      - app_logs:/app/logs
    profiles: ["production"]

  worker-payment:
    build: .
    container_name: anonkeymail-worker-payment
    command: ["ts-node", "worker/payment-retry.js"]
    env_file: .env
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      worker:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "node -e \"process.exit(0)\""]
      interval: 15s
      start_period: 30s
    volumes:
      - app_logs:/app/logs
    profiles: ["production"]

  realtime:
    build: .
    container_name: anonkeymail-realtime
    command: ["ts-node", "worker/realtime-server.js"]
    env_file: .env
    restart: unless-stopped
    expose:
      - "3001"
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'nc -z 127.0.0.1 ${REALTIME_PORT:-3001} || exit 1']
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 20s
    volumes:
      - app_logs:/app/logs

  postgres:
    image: postgres:16-alpine
    container_name: anonkeymail-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-anonkeymail}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-anonkeymail}
      POSTGRES_DB: ${POSTGRES_DB:-anonkeymail}
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-anonkeymail}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  redis:
    image: redis:7-alpine
    container_name: anonkeymail-redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  postfix:
    build:
      context: .
      dockerfile: Dockerfile.postfix
    container_name: anonkeymail-postfix
    restart: unless-stopped
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_USER: ${POSTGRES_USER:-anonkeymail}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-anonkeymail}
      POSTGRES_DB: ${POSTGRES_DB:-anonkeymail}
      POSTFIX_SYNC_INTERVAL_SECONDS: "30"
    volumes:
      - ./postfix-config:/etc/postfix:rw
      - postfix_spool:/var/spool/virtual
    ports:
      - "25:25"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "nc -z localhost 25 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 60s
    profiles: ["production"]

  proxy:
    image: nginx:1.27-alpine
    container_name: anonkeymail-proxy
    restart: unless-stopped
    profiles: ["production"]
    depends_on:
      app:
        condition: service_healthy
      realtime:
        condition: service_healthy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./certs:/etc/nginx/certs:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro

volumes:
  pg_data:
  redis_data:
  postfix_spool:
  app_logs:
=====END_TEMP_YAML=====

echo "Создан временный docker-compose-temp.yml с пропущенной миграцией в app"

# 3. Запускаем временный compose
docker compose -f docker-compose-temp.yml --profile production up -d

sleep 25

echo "Проверяем статус (app должен запуститься без миграции)"
docker compose -f docker-compose-temp.yml ps --all

# 4. Чиним миграционную таблицу
echo ""
echo "Исправляем запись в _prisma_migrations (rolled-back)"
docker compose -f docker-compose-temp.yml exec -it anonkeymail-app sh -c "
  echo 'Пытаемся пометить миграцию как rolled-back...'
  npx prisma migrate resolve --rolled-back 20260320000000_add_referral_system || echo 'rolled-back не сработал, пробуем applied...'
  npx prisma migrate resolve --applied 20260320000000_add_referral_system || echo 'Оба варианта не прошли — смотри логи'
"

# 5. Останавливаем временный запуск
docker compose -f docker-compose-temp.yml down || true

# 6. Возвращаемся к нормальному compose
echo "Запускаем оригинальный compose"
docker compose --profile production up -d

sleep 20

echo "Финальный статус:"
docker compose ps --all

echo ""
echo "ЛОГИ APP (последние 120 строк):"
docker logs anonkeymail-app --tail 120

echo ""
echo "Если в логах теперь 'server started' / 'listening on' / 'PrismaClient initialized' — успех."
echo "Если всё ещё P3009 — пришли логи, будем удалять запись из таблицы вручную."
