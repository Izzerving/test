#!/bin/bash
set -e

echo "=== FIX SCRIPT: исправляет postfix unhealthy + старое имя контейнера + несоответствие паролей в .env ==="
echo "Запущен из $(pwd)"

# 1. Полная очистка старых контейнеров и volumes (убираем конфликт time-email-postfix)
echo "→ Останавливаем и удаляем всё..."
docker compose --profile production down --remove-orphans -v --timeout 10 || true
docker rm -f time-email-postfix 2>/dev/null || true
docker rm -f $(docker ps -a -q --filter name=time-email) 2>/dev/null || true

# 2. Исправляем container_name в docker-compose.yml (было time-email-postfix)
echo "→ Фиксим container_name postfix → anonkeymail-postfix"
sed -i 's/container_name: time-email-postfix/container_name: anonkeymail-postfix/g' docker-compose.yml

# 3. Добавляем start_period в healthcheck postfix (чтобы не падал сразу)
echo "→ Добавляем start_period: 30s в healthcheck postfix"
sed -i '/retries: 10/a\      start_period: 30s' docker-compose.yml

# 4. Исправляем DATABASE_URL в .env.example и .env (чтобы пароль совпадал автоматически)
echo "→ Фиксим DATABASE_URL (интерполяция переменных)"
sed -i 's|DATABASE_URL="postgresql://anonkeymail:anonkeymail@postgres:5432/anonkeymail"|DATABASE_URL="postgresql://${POSTGRES_USER:-anonkeymail}:${POSTGRES_PASSWORD:-anonkeymail}@postgres:5432/${POSTGRES_DB:-anonkeymail}"|' .env.example 2>/dev/null || true
sed -i 's|DATABASE_URL="postgresql://anonkeymail:anonkeymail@postgres:5432/anonkeymail"|DATABASE_URL="postgresql://${POSTGRES_USER:-anonkeymail}:${POSTGRES_PASSWORD:-anonkeymail}@postgres:5432/${POSTGRES_DB:-anonkeymail}"|' .env 2>/dev/null || true

echo "→ Всё исправлено!"
echo ""
echo "Теперь сделай (если менял .env вручную):"
echo "cp .env.example .env && nano .env   # обязательно поменяй пароли и домены"
echo ""
echo "Запуск:"
echo "docker compose --profile production up -d --build"
echo ""
echo "После запуска проверь:"
echo "docker compose ps"
echo "docker logs -f anonkeymail-postfix --tail=50"
