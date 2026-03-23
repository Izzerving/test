#!/usr/bin/env bash
set -euo pipefail

echo "Фиксим миграцию: помечаем 20260320000000_add_referral_system как rolled back"

# Проверяем, что контейнер живой
if ! docker compose ps | grep -q "anonkeymail-app.*Up"; then
  echo "Контейнер app не запущен. Запускаем compose..."
  docker compose --profile production up -d
  sleep 10
fi

# Заходим в контейнер и выполняем команду
docker compose exec -it anonkeymail-app sh -c "
  echo 'Выполняем npx prisma migrate resolve --rolled-back ...'
  npx prisma migrate resolve --rolled-back 20260320000000_add_referral_system
"

echo ""
echo "Команда выполнена. Перезапускаем compose..."
docker compose --profile production down
sleep 3
docker compose --profile production up -d

sleep 10

echo ""
echo "СТАТУС:"
docker compose ps --all

echo ""
echo "ЛОГИ APP (последние 80 строк):"
docker logs anonkeymail-app --tail 80

echo ""
echo "Если сервер стартовал — увидишь строки типа 'listening on :3000' или 'PrismaClient ready'"
