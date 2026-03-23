#!/usr/bin/env bash
echo "🔍 ПОЛНАЯ ДИАГНОСТИКА + ИСПРАВЛЕНИЕ + АВТОСТАРТ"
echo "Время: $(date)"
cd ~/fin/email

echo "1. Статус всех контейнеров"
docker compose --profile production ps

echo "2. Логи proxy (nginx)"
docker logs anonkeymail-proxy --tail 40

echo "3. Логи основного приложения"
docker logs anonkeymail-app --tail 30

echo "4. Локальные тесты"
echo "HTTP 80:" && curl -I http://127.0.0.1 2>/dev/null || echo "НЕ ОТВЕЧАЕТ"
echo "HTTPS 443:" && curl -I -k https://127.0.0.1 2>/dev/null || echo "НЕ ОТВЕЧАЕТ"
echo "API health:" && curl -I http://127.0.0.1/api/health 2>/dev/null || echo "НЕ ОТВЕЧАЕТ"

echo "5. Порты и firewall"
ss -tuln | grep -E ':80|:443|:25'
sudo ufw status

echo "6. Cloudflare-проверка (снаружи)"
echo "Внешний тест домена:"
curl -I https://time-email.com 2>/dev/null || echo "НЕТ ОТВЕТА СНАРУЖИ (вероятно 522/523/526)"

echo "7. Исправляем самые частые причины"
# Пересоздаём nginx.conf с правильным proxy_pass (на всякий случай)
cat > nginx.conf << 'EOF'
server {
    listen 80;
    listen 443 ssl;
    http2 on;
    server_name time-email.com *.time-email.com mail-free-1.time-email.com;

    if (\$scheme != "https") {
        return 301 https://\$host\$request_uri;
    }

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
        proxy_pass http://anonkeymail-app:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# Перезапускаем всё чисто
docker compose --profile production down
docker compose --profile production up -d

sleep 10

echo ""
echo "✅ Диагностика завершена. Сейчас смотри:"
docker compose ps | grep -E "proxy|app|State"
docker logs anonkeymail-proxy --tail 20

echo ""
echo "📌 Что делать дальше:"
echo "   1. Пришли мне вывод этого скрипта (особенно строки с ошибками)"
echo "   2. Скажи, какая ошибка в браузере (522, 502, 404, сертификат не валиден и т.д.)"
echo ""

echo "🔄 Автозапуск после перезагрузки VPS (сделаем сейчас)"
cat > /etc/systemd/system/anonkeymail.service << 'EOF2'
[Unit]
Description=AnonKeyMail Docker Compose
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/root/fin/email
ExecStart=/usr/bin/docker compose --profile production up -d
ExecStop=/usr/bin/docker compose --profile production down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF2

systemctl daemon-reload
systemctl enable --now anonkeymail.service

echo "✅ Автозапуск настроен! После перезагрузки VPS всё поднимется само."
echo "Проверить: systemctl status anonkeymail"
