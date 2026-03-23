#!/usr/bin/env bash
set -euo pipefail

echo "Безопасный фикс P3009 через psql: ждём postgres + используем прямой exec по имени контейнера"
echo ""

# 1. Поднимаем только postgres и redis (если не запущены)
docker compose --profile production up -d postgres redis
sleep 15  # даём время на full healthy + init

echo "Статус postgres после паузы:"
docker compose ps | grep postgres || docker ps | grep anonkeymail-postgres

# 2. Проверяем, что контейнер действительно существует и running
PG_CONTAINER=$(docker ps -q -f name=anonkeymail-postgres)
if [ -z "$PG_CONTAINER" ]; then
  echo "Ошибка: контейнер anonkeymail-postgres не найден или не запущен!"
  docker ps | grep postgres
  exit 1
fi

echo "Найден контейнер postgres: $PG_CONTAINER"

# 3. Смотрим последние миграции (через docker exec напрямую)
echo ""
echo "Последние 5 миграций:"
docker exec -it "$PG_CONTAINER" psql -U ${POSTGRES_USER:-anonkeymail} -d ${POSTGRES_DB:-anonkeymail} -c "
  SELECT migration_name, started_at, finished_at, logs
  FROM _prisma_migrations
  ORDER BY started_at DESC
  LIMIT 5;
" || echo "Не удалось выполнить SELECT — смотри выше ошибки"

# 4. Удаляем проблемную миграцию
echo ""
echo "Удаляем failed миграцию 20260320000000_add_referral_system"
docker exec -it "$PG_CONTAINER" psql -U ${POSTGRES_USER:-anonkeymail} -d ${POSTGRES_DB:-anonkeymail} -c "
  DELETE FROM _prisma_migrations
  WHERE migration_name = '20260320000000_add_referral_system';

  -- Проверка удаления
  SELECT migration_name, started_at FROM _prisma_migrations
  WHERE migration_name = '20260320000000_add_referral_system';
" || echo "DELETE не прошёл — возможно, запись уже отсутствует"

# 5. Полный рестарт всего
echo ""
echo "Перезапускаем compose полностью"
docker compose --profile production down || true
sleep 5
docker compose --profile production up -d

sleep 25

echo "Финальный статус:"
docker compose ps --all

echo ""
echo "ЛОГИ APP (последние 150 строк — ищи прогресс миграций или новые ошибки):"
docker logs anonkeymail-app --tail 150

echo ""
echo "Если теперь миграция применилась (строки 'applied migration...' или 'Database is ready') — сервер должен стартовать."
echo "Если новая ошибка в миграции (например, SQL syntax в add_referral_system) — пришли логи, фиксим SQL."
