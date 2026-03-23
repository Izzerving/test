# Production Deployment Guide for AnonKeyMail

## Prerequisites

- Ubuntu 22.04/24.04 LTS (recommended)
- Minimum: 2 vCPU, 4GB RAM, 50GB SSD
- Docker Engine 24+ and Docker Compose v2+
- Domain name with DNS access
- SSL certificates (Let's Encrypt recommended)

## Pre-Deployment Checklist

- [ ] Generate all required secrets for `.env` file
- [ ] Prepare SSL certificates (fullchain.pem, privkey.pem)
- [ ] Configure PostgreSQL password (use strong password)
- [ ] Set up Cloudflare account and add domain
- [ ] Enable firewall (UFW) and configure ports
- [ ] Set up fail2ban for rate limiting
- [ ] Plan backup strategy for PostgreSQL

## Step 1: Server Hardening

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install UFW
sudo apt install -y ufw

# Configure firewall (allow SSH, HTTP, HTTPS only)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable

# Install fail2ban
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## Step 2: Install Docker & Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add current user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

## Step 3: Clone Repository & Setup Environment

```bash
# Clone repository
git clone https://github.com/Aburtik3/1.git anonkeymail
cd anonkeymail
git checkout codex/set-up-vps-for-anonkeymail

# Create .env file from example
cp .env.example .env

# Edit .env with production values
nano .env
```

## Step 4: Configure Environment Variables

**Critical Variables (Change All):**

```env
# Core
NODE_ENV="production"
APP_URL="https://your-domain.com"
LOG_LEVEL="info"

# Database (use strong password)
POSTGRES_PASSWORD="generate_strong_password_here"
DATABASE_URL="postgresql://anonkeymail:YOUR_STRONG_PASSWORD@postgres:5432/anonkeymail"

# Security Keys (use: openssl rand -hex 32)
ADMIN_SUPER_KEY="generate_with_openssl_rand"
INGEST_API_KEY="generate_with_openssl_rand"
GUEST_COOKIE_SECRET="generate_with_openssl_rand"

# Domain
PRIMARY_MAIL_DOMAIN="mail-free-1.your-domain.com"
NEXT_PUBLIC_APP_DOMAIN="your-domain.com"

# Cloudflare (Optional but recommended)
CLOUDFLARE_API_TOKEN="your_cloudflare_api_token"
CLOUDFLARE_ZONE_ID="your_cloudflare_zone_id"
CLOUDFLARE_DOMAIN="your-domain.com"

# Payment Integrations (set to "" if not using)
TELEGRAM_BOT_TOKEN=""
CRYPTOBOT_MERCHANT_TOKEN=""
MONERO_RPC_URL=""
```

**Generate Secure Passwords:**

```bash
# Generate 32-byte hex strings for secrets
openssl rand -hex 32  # Run 3 times for the 3 secret keys
```

## Step 5: Prepare SSL Certificates

```bash
# Create certs directory
mkdir -p certs

# Option A: Using Let's Encrypt with Certbot
sudo apt install -y certbot python3-certbot-dns-cloudflare

# Place Cloudflare credentials in ~/.secrets/certbot/cloudflare.ini
mkdir -p ~/.secrets/certbot
echo 'dns_cloudflare_api_token = YOUR_CLOUDFLARE_TOKEN' > ~/.secrets/certbot/cloudflare.ini
chmod 600 ~/.secrets/certbot/cloudflare.ini

# Get certificate
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/certbot/cloudflare.ini \
  -d your-domain.com -d www.your-domain.com \
  -d mail-free-1.your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem certs/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem certs/
sudo chown $USER:$USER certs/*
```

## Step 6: Configure Nginx

```bash
# Copy and customize nginx config
cp nginx.conf.example ./nginx.conf

# Edit for your domain
sed -i 's/YOUR_DOMAIN/your-domain.com/g' ./nginx.conf
```

## Step 7: Initial Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations (first time only)
docker compose --profile production run --rm app npx prisma migrate deploy
```

## Step 8: Launch Production

```bash
# Build and start services
docker compose --profile production up -d --build

# Verify all services are running
docker compose ps

# Check application health
curl -sS https://your-domain.com/api/health | jq

# View logs
docker compose logs -f --tail=100
```

## Step 9: Cloudflare Configuration

1. Go to Cloudflare Dashboard > Select your domain
2. **SSL/TLS**: Set mode to "Full (strict)"
3. **Caching**: Set cache level to "Standard"
4. **WAF**: Enable Managed Rules
5. **Bot Management**: Enable Bot Fight Mode
6. **Rate Limiting**: Set rules for:
   - `/api/auth/*`: 10 requests/minute
   - `/api/ingest/email`: 30 requests/minute
   - `/api/*`: 100 requests/minute

## Step 10: PostgreSQL Backups

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p $BACKUP_DIR

docker exec anonkeymail-postgres pg_dump \
  -U anonkeymail anonkeymail \
  -f /tmp/backup_$TIMESTAMP.sql

docker cp anonkeymail-postgres:/tmp/backup_$TIMESTAMP.sql \
  $BACKUP_DIR/backup_$TIMESTAMP.sql

# Keep last 30 days of backups
find $BACKUP_DIR -name "backup_*.sql" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/backup_$TIMESTAMP.sql"
EOF

chmod +x backup.sh

# Setup daily backup cron (run at 2 AM)
(crontab -l; echo "0 2 * * * /root/anonkeymail/backup.sh") | crontab -
```

## Step 11: Monitoring & Updates

### Health Checks

```bash
# Manual health check
curl -sS https://your-domain.com/api/health

# Monitor logs
docker compose logs -f app

# Check service status
docker compose ps
```

### Update & Restart

```bash
# Pull latest changes
git pull

# Rebuild and restart (zero-downtime)
docker compose --profile production up -d --build

# View update logs
docker compose logs -f
```

## Step 12: Security Hardening

```bash
# Secure Docker daemon
sudo mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "icc": false,
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  }
}
EOF

sudo systemctl restart docker

# Configure SELinux (Ubuntu doesn't use SELinux, but AppArmor)
sudo aa-enforce /etc/apparmor.d/docker-default
```

## Troubleshooting

### Services not starting

```bash
# Check service status and logs
docker compose ps
docker compose logs postgres
docker compose logs redis
docker compose logs app
```

### Database connection errors

```bash
# Test PostgreSQL connection
docker exec anonkeymail-postgres pg_isready -U anonkeymail

# Test Redis connection
docker exec anonkeymail-redis redis-cli ping
```

### Email not arriving

```bash
# Check Postfix logs
docker compose logs postfix

# Test mail delivery
docker exec anonkeymail-postfix postfix status
```

### Certificate issues

```bash
# Check certificate expiration
openssl x509 -in certs/fullchain.pem -noout -dates

# Renew certificates
certbot renew --dns-cloudflare --dns-cloudflare-credentials ~/.secrets/certbot/cloudflare.ini
```

## Performance Tuning

### PostgreSQL

```bash
# Optimize PostgreSQL in docker-compose.yml
# Add to postgres service environment:
POSTGRES_INIT_ARGS: "-c max_connections=200 -c shared_buffers=256MB"
```

### Redis

```bash
# Configure Redis for better performance
# Update redis command in docker-compose.yml:
# ["redis-server", "--appendonly", "yes", "--maxmemory", "512mb", "--maxmemory-policy", "allkeys-lru"]
```

## Production Best Practices

1. **Secrets Management**
   - Use strong, randomly generated passwords
   - Rotate secrets regularly (at least quarterly)
   - Never commit `.env` to version control

2. **Monitoring**
   - Set up alerts for high CPU/memory usage
   - Monitor disk space for database growth
   - Set up uptime monitoring

3. **Backups**
   - Daily PostgreSQL backups to external storage
   - Test restore procedures monthly
   - Keep backups for at least 30 days

4. **Updates**
   - Schedule monthly security updates
   - Test updates in staging first
   - Plan for zero-downtime deployments

5. **Logging**
   - Centralize logs for analysis
   - Set retention policies (e.g., 30 days)
   - Monitor for suspicious patterns

## Support & Issues

- Repository: https://github.com/Aburtik3/1
- Documentation: Check `docs/` directory
- Security Issues: Report privately to maintainers

---

**Last Updated:** March 2025
**Version:** 1.0.0
