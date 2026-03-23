#!/bin/bash
set -e

echo "=== Простой фикс: монтируем certs и nginx.conf ==="
echo "Текущая папка: $(pwd)"

# Проверяем наличие файлов сертификатов
if [ ! -f certs/fullchain.pem ] || [ ! -f certs/privkey.pem ]; then
  echo "ОШИБКА: certs/fullchain.pem или certs/privkey.pem НЕ НАЙДЕНЫ!"
  echo "Убедись, что ты в ~/fin/email и файлы лежат в ./certs/"
  ls -l certs/
  exit 1
fi

echo "Сертификаты найдены:"
ls -l certs/fullchain.pem certs/privkey.pem

# Создаём nginx.conf если его нет (или перезаписываем)
cat > nginx.conf << 'EOF'
server {
    listen 80;
    listen 443 ssl http2;

    server_name time-email.com *.time-email.com mail-free-1.time-email.com;

    # Редирект http → https
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

echo "nginx.conf создан/обновлён"

# Проверяем docker-compose.yml на наличие нужных volume
echo ""
echo "Проверяем и правим docker-compose.yml..."

COMPOSE_FILE="docker-compose.yml"

# Добавляем volume для certs если нет
if ! grep -q "./certs:/etc/nginx/certs" "$COMPOSE_FILE"; then
  echo "Добавляю volume для certs..."
  sed -i '/proxy:/a \    volumes:\n      - ./certs:/etc/nginx/certs:ro' "$COMPOSE_FILE" || echo "Не смог sed — добавь вручную в сервис proxy:"
fi

# Добавляем монтирование nginx.conf (предполагаем, что conf.d/default.conf — стандарт)
if ! grep -q "nginx.conf" "$COMPOSE_FILE"; then
  echo "Добавляю монтирование nginx.conf..."
  sed -i '/volumes:/a \      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro' "$COMPOSE_FILE" || echo "Не смог sed — добавь вручную:"
fi

echo ""
echo "Содержимое volume-секции в proxy (проверь сам):"
grep -A 5 "proxy:" "$COMPOSE_FILE" || grep -A 10 "nginx" "$COMPOSE_FILE"

echo ""
echo "=== Что делать дальше (выполни по порядку): ==="
echo "1. docker compose --profile production down"
echo "2. docker compose --profile production up -d"
echo "3. docker compose ps | grep proxy     # должен быть Up, не restarting"
echo "4. docker logs anonkeymail-proxy --tail 50   # смотри, нет ли [emerg]"
echo ""
echo "Если всё ок — открывай https://time-email.com"
echo "Если ошибка — пришли новые логи proxy"
