# Аудит исполнения ТЗ и план доработок

## Уже закрыто
- ключевая регистрация/логин;
- tier-aware доменная модель;
- guest/free/premium/unlimited ограничения по ящикам;
- docker-compose, Postfix, Redis, Prisma, admin-разделы;
- realtime backend + live dashboard subscription + live guest inbox polling.

## Доработано в текущей итерации
- платежи теперь планируются как `PREMIUM_MONTHLY` или `UNLIMITED_LIFETIME`;
- фронтенд dashboard получил реальный inbox UX и premium-форму создания ящиков;
- добавлен отдельный раздел `/admin/stats`;
- убрано хранение `ip` и `userAgent` в сессиях;
- login перестал возвращать session token в JSON и не требует localStorage;
- cleanup worker переведён на исполняемый `worker/cleanup.js` и запускается без TypeScript-рантайма;
- `user_domain_access` перенесён под управление Prisma schema/migrations;
- README дополнен missing-документами.

## Что ещё остаётся
- обновить `package-lock.json` после полной установки зависимостей;
- прогнать полноценные интеграционные e2e/CI проверки в среде с рабочим `npm ci`;
- при необходимости расширить realtime на guest-flow до websocket-модели.
