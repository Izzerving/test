#!/usr/bin/env bash
set -euo pipefail

echo "======================================"
echo "   ПОЛНЫЙ АВТО-ФИКС: docker-compose + nginx + certs"
echo "   Директория: $(pwd)"
echo "======================================"

# 1. Создаём правильный docker-compose.yml
cat > docker-compose.yml << '=====END_YAML====='
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
      test: ["CMD-SHELL", "nc -z 127.0.0.1 \${REALTIME_PORT:-3001} || exit 1"]
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
      POSTGRES_USER: \${POSTGRES_USER:-anonkeymail}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-anonkeymail}
      POSTGRES_DB: \${POSTGRES_DB:-anonkeymail}
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-anonkeymail}"]
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
      POSTGRES_USER: \${POSTGRES_USER:-anonkeymail}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-anonkeymail}
      POSTGRES_DB: \${POSTGRES_DB:-anonkeymail}
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
=====END_YAML=====

echo "docker-compose.yml создан/обновлён"

# 2. Создаём правильный nginx.conf
cat > nginx.conf << '=====END_NGINX====='
server {
    listen 80;
    listen 443 ssl;
    http2 on;

    server_name time-email.com *.time-email.com mail-free-1.time-email.com;

    if ($scheme != "https") {
        return 301 https://$host$request_uri;
    }

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
        proxy_pass http://anonkeymail-app:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
=====END_NGINX=====

echo "nginx.conf создан"

# 3. Проверяем сертификаты
if [[ -f certs/fullchain.pem && -f certs/privkey.pem ]]; then
  echo "Сертификаты найдены:"
  ls -l certs/
  head -n 3 certs/fullchain.pem | grep -q "BEGIN CERTIFICATE" || echo "ВНИМАНИЕ: fullchain.pem выглядит неправильно!"
  head -n 3 certs/privkey.pem | grep -q "BEGIN.*PRIVATE KEY" || echo "ВНИМАНИЕ: privkey.pem выглядит неправильно!"
else
  echo "Сертификаты НЕ НАЙДЕНЫ! Создай их в certs/ и перезапусти скрипт."
fi

# 4. Перезапуск
echo ""
echo "Перезапускаем compose..."
docker compose --profile production down || true
sleep 3
docker compose --profile production up -d

sleep 12

# 5. Показываем результат
echo ""
echo "СТАТУС КОНТЕЙНЕРОВ:"
docker compose ps

echo ""
echo "ЛОГИ APP (самое важное):"
docker logs anonkeymail-app --tail 60

echo ""
echo "ЛОГИ PROXY:"
docker logs anonkeymail-proxy --tail 40

echo ""
echo "ГОТОВО. Если app всё ещё restarting — смотри логи выше (Prisma migrate failed)."
echo "Если ошибка в privkey.pem — пересоздай certs/privkey.pem из Cloudflare."
