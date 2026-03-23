#!/usr/bin/env bash
set -euo pipefail

echo "======================================"
echo "   Быстрый фикс nginx + certs + compose"
echo "   Директория: $(pwd)"
echo "======================================"

# ──────────────────────────────────────────────
# 1. Проверяем сертификаты
# ──────────────────────────────────────────────

CERTS_DIR="./certs"

if [[ ! -f "$CERTS_DIR/fullchain.pem" || ! -f "$CERTS_DIR/privkey.pem" ]]; then
    echo "ОШИБКА: certs/fullchain.pem или certs/privkey.pem НЕ НАЙДЕНЫ"
    ls -la "$CERTS_DIR" 2>/dev/null || echo "Папки certs вообще нет"
    exit 1
fi

echo "Сертификаты найдены:"
ls -l "$CERTS_DIR"/fullchain.pem "$CERTS_DIR"/privkey.pem

# Проверяем начало файлов (самая частая причина ошибки PEM)
head -n 3 "$CERTS_DIR/fullchain.pem" | grep -q "BEGIN CERTIFICATE" || {
    echo "ОШИБКА: fullchain.pem НЕ начинается с -----BEGIN CERTIFICATE-----"
    echo "Покажу первые строки:"
    head -n 8 "$CERTS_DIR/fullchain.pem"
    echo "Нужно пересоздать файл! Выход."
    exit 1
}

head -n 3 "$CERTS_DIR/privkey.pem" | grep -q "BEGIN.*PRIVATE KEY" || {
    echo "ОШИБКА: privkey.pem НЕ начинается с -----BEGIN .* PRIVATE KEY-----"
    head -n 8 "$CERTS_DIR/privkey.pem"
    echo "Нужно пересоздать файл! Выход."
    exit 1
}

# Права
chmod 644 "$CERTS_DIR/fullchain.pem" 2>/dev/null
chmod 600 "$CERTS_DIR/privkey.pem"   2>/dev/null

# ──────────────────────────────────────────────
# 2. Создаём правильный nginx.conf
# ──────────────────────────────────────────────

cat > nginx.conf << 'EOF'
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
EOF

echo "nginx.conf перезаписан"

# ──────────────────────────────────────────────
# 3. Исправляем docker-compose.yml (volumes + ports без дубликатов)
# ──────────────────────────────────────────────

COMPOSE="docker-compose.yml"

if [[ ! -f "$COMPOSE" ]]; then
    echo "Файл $COMPOSE не найден! Выход."
    exit 1
fi

# Делаем бэкап на всякий случай
cp "$COMPOSE" "${COMPOSE}.bak-$(date +%s)"

# Удаляем все существующие volumes и ports у proxy (чтобы не было дубликатов)
awk -v RS= -v ORS='\n\n' '
    /proxy:/ {
        gsub(/ports:([^}]*)/,"");
        gsub(/volumes:([^}]*)/,"");
        print
    }
    !/proxy:/ {print}
' "$COMPOSE" > tmp.yml && mv tmp.yml "$COMPOSE" || { echo "awk сломался"; exit 1; }

# Добавляем ports и volumes в конец блока proxy (самый простой способ без sed-кошмара)
sed -i '/proxy:/,/^  [^ ]/ {
    /^  [^ ]/ i\    ports:\n      - "80:80"\n      - "443:443"\n    volumes:\n      - ./certs:/etc/nginx/certs:ro\n      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro\n
    b
}' "$COMPOSE" || echo "sed не смог — добавь ports/volumes вручную"

echo ""
echo "docker-compose.yml обновлён. Текущий вид сервиса proxy:"
grep -A 15 "proxy:" "$COMPOSE" || cat "$COMPOSE" | tail -n 30

# ──────────────────────────────────────────────
# 4. Перезапуск
# ──────────────────────────────────────────────

echo ""
echo "Перезапускаем compose..."
docker compose --profile production down || true
sleep 2
docker compose --profile production up -d

sleep 8

echo ""
echo "Статус:"
docker compose ps | grep -E "proxy|State"

echo ""
echo "Последние логи proxy:"
docker logs anonkeymail-proxy --tail 50

echo ""
echo "Готово. Проверь:"
echo "  https://time-email.com"
echo "  curl -I -k https://127.0.0.1"
echo ""
echo "Если всё ещё ошибка про PEM — покажи:"
echo "  head -n 8 certs/fullchain.pem"
