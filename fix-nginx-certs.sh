#!/bin/bash

set -e

DOMAIN="Time-email.com"              # ← ИЗМЕНИ ЭТО ОБЯЗАТЕЛЬНО
SUBDOMAINS="*.time-email.com mail-free-1.time-email.com"
PROJECT_DIR="$HOME/fin/email"
CERTS_DIR="$PROJECT_DIR/certs"
NGINX_CONF="$PROJECT_DIR/nginx.conf"

echo "=== Фикс nginx + сертификаты для $DOMAIN ==="
echo "Текущая директория: $PROJECT_DIR"
cd "$PROJECT_DIR" || { echo "Не могу зайти в $PROJECT_DIR"; exit 1; }

# 1. Создаём папку certs если нет
mkdir -p "$CERTS_DIR"
chmod 755 "$CERTS_DIR"

echo ""
echo "=== ШАГ: Вставь сертификаты Cloudflare Origin CA ==="
echo "Сейчас откроется nano для fullchain.pem"
echo "Вставь туда весь текст Origin Certificate (включая -----BEGIN CERTIFICATE----- ...)"
echo "Сохрани: Ctrl+O → Enter → Ctrl+X"
echo "Через 3 секунды откроется..."
sleep 3
nano "$CERTS_DIR/fullchain.pem"

echo ""
echo "Теперь вставь Private Key в privkey.pem"
echo "Вставь весь текст приватного ключа"
sleep 2
nano "$CERTS_DIR/privkey.pem"

# Права на файлы
chmod 644 "$CERTS_DIR/fullchain.pem"
chmod 600 "$CERTS_DIR/privkey.pem"

# Проверка, что файлы не пустые
if [ ! -s "$CERTS_DIR/fullchain.pem" ] || [ ! -s "$CERTS_DIR/privkey.pem" ]; then
  echo "ОШИБКА: один из файлов пустой! Запусти скрипт заново и вставь содержимое."
  exit 1
fi

echo ""
echo "Сертификаты созданы:"
ls -l "$CERTS_DIR"

# 2. Создаём/перезаписываем nginx.conf
echo ""
echo "Создаю/обновляю nginx.conf ..."

cat > "$NGINX_CONF" << EOC
server {
    listen 80;
    listen 443 ssl;
    http2 on;

    server_name $DOMAIN $SUBDOMAINS;

    # Редирект http → https
    if (\$scheme != "https") {
        return 301 https://\$host\$request_uri;
    }

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # Полезные заголовки для Cloudflare
    ssl_stapling on;
    ssl_stapling_verify on;

    location / {
        proxy_pass http://app:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Можно добавить другие location если нужно (api, static и т.д.)
}
EOC

echo "nginx.conf создан:"
head -n 15 "$NGINX_CONF"
echo "..."

# 3. Проверяем/добавляем volume в docker-compose.yml
echo ""
echo "Проверяю docker-compose.yml ..."

if ! grep -q "./certs:/etc/nginx/certs" docker-compose.yml; then
  echo "Добавляю volume для certs в сервис proxy..."
  sed -i '/proxy:/a \    volumes:\n      - ./certs:/etc/nginx/certs:ro' docker-compose.yml || {
    echo "Не удалось автоматически добавить volume. Добавь вручную:"
    echo "  volumes:"
    echo "    - ./certs:/etc/nginx/certs:ro"
    echo "в секцию сервиса proxy"
  }
fi

if ! grep -q "nginx.conf" docker-compose.yml; then
  echo "Добавляю монтирование nginx.conf..."
  sed -i '/proxy:/a \      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro' docker-compose.yml || {
    echo "Не удалось добавить строку. Добавь вручную:"
    echo "      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro"
  }
fi

echo ""
echo "=== Готово! Теперь запускаем ==="
echo "Выполни эти команды по очереди:"
echo ""
echo "docker compose --profile production down"
echo "docker compose --profile production up -d"
echo ""
echo "Затем проверь:"
echo "docker compose ps | grep proxy"
echo "docker logs anonkeymail-proxy --tail 40"
echo ""
echo "Если proxy Up и без [emerg] — пробуй браузер: https://$DOMAIN"
echo "Если ошибка — пришли логи proxy"
