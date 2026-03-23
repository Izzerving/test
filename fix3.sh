#!/bin/bash
set -e

echo "=== FIX3: исправляет postfix unhealthy (отсутствие nc + race с миграциями) ==="
echo "Запущен из $(pwd)"

# 1. Полная остановка всего
docker compose --profile production down --remove-orphans -v --timeout 15 || true

# 2. Исправляем Dockerfile.postfix — добавляем netcat-openbsd (для healthcheck nc -z)
cat > Dockerfile.postfix << 'EOF'
FROM boky/postfix:latest

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client netcat-openbsd \
  && rm -rf /var/lib/apt/lists/*

COPY scripts/entrypoint-postfix.sh /entrypoint-postfix.sh
COPY postfix-config/ /etc/postfix/

RUN chmod +x /entrypoint-postfix.sh

ENTRYPOINT ["/entrypoint-postfix.sh"]
CMD ["postfix", "start-fg"]
EOF

echo "→ Dockerfile.postfix обновлён (добавлен netcat-openbsd)"

# 3. Перезаписываем docker-compose.yml чистой версией (с depends_on worker для postfix + start_period)
cat > docker-compose.yml << 'EOF'
name: anonkeymail

services:
  app:
    build: .
    container_name: anonkeymail-app
    env_file: .env
    restart: unless-stopped
    expose:
      - "3000"
    command: []
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      worker:
        condition: service_healthy
      worker-payment:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 40s
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
      test: ["CMD-SHELL", 'node -e "process.exit(0)"']
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 30s
    volumes:
      - app_logs:/app/logs
    profiles: ['production']

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
      test: ["CMD-SHELL", 'node -e "process.exit(0)"']
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 30s
    volumes:
      - app_logs:/app/logs
    profiles: ['production']

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
      test: ["CMD-SHELL", "node -e \"const net=require('net');const p=Number(process.env.REALTIME_PORT||3001);const s=net.connect(p,'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),2000);\""]
      interval: 30s
      timeout: 5s
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
    expose:
      - "5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-anonkeymail} -d ${POSTGRES_DB:-anonkeymail}"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s

  redis:
    image: redis:7-alpine
    container_name: anonkeymail-redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    expose:
      - "6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 10
      start_period: 10s

  postfix:
    build:
      context: .
      dockerfile: Dockerfile.postfix
    container_name: anonkeymail-postfix
    restart: unless-stopped
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_PORT: "5432"
      POSTGRES_USER: ${POSTGRES_USER:-anonkeymail}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-anonkeymail}
      POSTGRES_DB: ${POSTGRES_DB:-anonkeymail}
      POSTFIX_SYNC_INTERVAL_SECONDS: ${POSTFIX_SYNC_INTERVAL_SECONDS:-30}
    volumes:
      - ./postfix-config:/etc/postfix:rw
      - postfix_spool:/var/spool/virtual
    ports:
      - "25:25"
    depends_on:
      postgres:
        condition: service_healthy
      worker:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'nc -z localhost 25 || exit 1']
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 45s
    profiles: ['production']

  proxy:
    image: nginx:1.27-alpine
    container_name: anonkeymail-proxy
    restart: unless-stopped
    profiles: ["production"]
    depends_on:
      app:
        condition: service_healthy
      worker:
        condition: service_healthy
      worker-payment:
        condition: service_healthy
      realtime:
        condition: service_healthy
      postfix:
        condition: service_healthy
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf.example:/etc/nginx/conf.d/default.conf:ro
      - ./certs:/etc/nginx/certs:ro

volumes:
  pg_data:
  redis_data:
  postfix_spool:
  app_logs:
EOF

echo "→ docker-compose.yml перезаписан (postfix теперь ждёт worker healthy + start_period 45s)"

echo ""
echo "Запуск (пересоберёт postfix):"
echo "docker compose --profile production up -d --build"
echo ""
echo "После запуска сразу проверь:"
echo "docker compose ps"
echo "docker logs anonkeymail-postfix --tail=50"
echo "docker logs anonkeymail-worker --tail=30"
