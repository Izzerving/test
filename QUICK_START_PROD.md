# Quick Start: Deploy AnonKeyMail to Production (5 Minutes)

## Prerequisites
- VPS with Ubuntu 22.04+
- Domain name with DNS access
- ~10 GB disk space

## One-Time Setup

### 1. Connect to VPS and prepare
```bash
ssh root@your-vps-ip

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose git

# Create deploy user
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
su - deploy
```

### 2. Clone and configure
```bash
# Clone repository
git clone https://github.com/Aburtik3/1.git anonkeymail
cd anonkeymail
git checkout codex/set-up-vps-for-anonkeymail

# Copy environment template
cp .env.example .env

# Generate secrets
ADMIN_KEY=$(openssl rand -hex 32)
INGEST_KEY=$(openssl rand -hex 32)
GUEST_KEY=$(openssl rand -hex 32)
DB_PASS=$(openssl rand -hex 32)

# Edit .env with your values
nano .env
# Change: APP_URL, PRIMARY_MAIL_DOMAIN, all keys, DB password, Cloudflare tokens
```

### 3. Prepare SSL certificates
```bash
# Create certs directory
mkdir -p certs

# Option A: Using Let's Encrypt (recommended)
sudo apt install -y certbot

sudo certbot certonly --standalone \
  -d your-domain.com \
  -d www.your-domain.com \
  -d mail-free-1.your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem certs/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem certs/
sudo chown deploy:deploy certs/*
```

### 4. Configure Nginx
```bash
# Update domain in nginx config
sed -i 's/YOUR_DOMAIN/your-domain.com/g' nginx.conf.example
```

### 5. Deploy
```bash
# Start production environment
docker compose --profile production up -d --build

# Verify
docker compose ps

# Health check
curl -sS https://your-domain.com/api/health
```

## Regular Maintenance

### Daily
```bash
# Check service health
docker compose ps

# View recent logs
docker compose logs --tail=50 app
```

### Weekly
```bash
# Backup database
docker exec anonkeymail-postgres pg_dump \
  -U anonkeymail anonkeymail \
  > backup_$(date +%Y%m%d).sql
```

### Monthly
- Test backup restoration
- Review security logs
- Check SSL certificate expiration

## Common Commands

```bash
# View logs
docker compose logs -f app              # Follow app logs
docker compose logs -f postfix          # Follow email logs
docker compose logs --tail=100          # Last 100 lines

# Restart services
docker compose restart app              # Restart app
docker compose restart postgres         # Restart database
docker compose --profile production restart  # Restart all

# Update
git pull
docker compose --profile production up -d --build

# Stop
docker compose --profile production down

# Rebuild
docker compose --profile production up -d --build --no-cache
```

## Troubleshooting

### Services failing to start
```bash
# Check what's wrong
docker compose logs

# Common issues:
# 1. Postgres not ready - wait 30 seconds
# 2. Redis connection - check ports
# 3. Postfix configuration - check environment variables
```

### Database migration failed
```bash
# Run migrations manually
docker compose --profile production run --rm app npx prisma migrate deploy

# Or reset (WARNING: clears data)
docker compose exec postgres psql -U anonkeymail -c "DROP DATABASE anonkeymail; CREATE DATABASE anonkeymail;"
docker compose --profile production run --rm app npx prisma migrate deploy
```

### SSL certificate issues
```bash
# Check expiration
openssl x509 -in certs/fullchain.pem -noout -dates

# Renew
sudo certbot renew

# Copy new certificate
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem certs/
sudo chown deploy:deploy certs/*

# Restart nginx
docker compose restart proxy
```

## Security Reminders

1. **Change all secrets** in `.env` file (don't use examples)
2. **Use strong PostgreSQL password** (20+ characters)
3. **Enable firewall**:
   ```bash
   sudo ufw default deny incoming
   sudo ufw allow 22 80 443
   sudo ufw enable
   ```
4. **Set up fail2ban**:
   ```bash
   sudo apt install -y fail2ban
   sudo systemctl enable fail2ban
   ```

## Need Help?

- Full guide: `PRODUCTION_DEPLOY_GUIDE.md`
- Checklist: `PRODUCTION_CHECKLIST.md`
- Issues: Check logs with `docker compose logs`
- Documentation: `docs/` directory

---

**Deployed!** Your AnonKeyMail instance is now running at `https://your-domain.com`
