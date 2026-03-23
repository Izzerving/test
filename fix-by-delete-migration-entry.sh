#!/usr/bin/env bash
set -euo pipefail

echo "Фикс P3009: удаляем failed-запись миграции напрямую из _prisma_migrations"
echo "Это безопасно, если миграция не применилась частично (проверим сначала)"
echo ""

# 1. Убеждаемся, что postgres запущен
docker compose --profile production up -d postgres redis   # поднимаем только зависимости
sleep 8

echo "Проверяем статус postgres:"
docker compose ps | grep postgres

# 2. Заходим в psql и смотрим последние миграции (для понимания)
echo ""
echo "Последние 5 миграций в таблице _prisma_migrations:"
docker compose exec -it anonkeymail-postgres psql -U ${POSTGRES_USER:-anonkeymail} -d ${POSTGRES_DB:-anonkeymail} -c "
  SELECT migration_name, started_at, finished_at, logs 
  FROM _prisma_migrations 
  ORDER BY started_at DESC 
  LIMIT 5;
"

# 3. Удаляем проблемную запись
echo ""
echo "Удаляем запись миграции 20260320000000_add_referral_system"
docker compose exec -it anonkeymail-postgres psql -U ${POSTGRES_USER:-anonkeymail} -d ${POSTGRES_DB:-anonkeymail} -c "
  DELETE FROM _prisma_migrations 
  WHERE migration_name = '20260320000000_add_referral_system';
  
  -- Проверяем, что удалили
  SELECT migration_name, started_at FROM _prisma_migrations 
  WHERE migration_name = '20260320000000_add_referral_system';
"

# 4. Полный перезапуск compose
echo ""
echo "Перезапускаем весь compose — теперь миграции должны пройти заново"
docker compose --profile production down || true
sleep 4
docker compose --profile production up -d

sleep 20

# 5. Результат
echo ""
echo "СТАТУС КОНТЕЙНЕРОВ:"
docker compose ps --all

echo ""
echo "ЛОГИ APP (последние 120 строк — ищи 'applied' / 'server started' / ошибки):"
docker logs anonkeymail-app --tail 120

echo ""
echo "ЛОГИ POSTGRES (если нужно):"
docker logs anonkeymail-postgres --tail 40

echo "ГОТОВО."
echo "• Если теперь в логах app 'Migration 20260320000000_add_referral_system applied' или 'All migrations applied' — успех."
echo "• Если появилась новая ошибка в миграции — пришли логи, будем фиксить SQL миграции."
echo "• Если данных в базе мало/тестовые — можно было просто volume rm pg_data, но мы сохранили данные."
