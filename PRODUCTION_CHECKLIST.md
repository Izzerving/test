# Production Readiness Checklist

## Security

- [x] Fixed database ports exposure (PostgreSQL 5432, Redis 6379 now use `expose` instead of `ports`)
- [x] Updated Nginx configuration with enhanced security headers:
  - [x] Strict-Transport-Security (HSTS)
  - [x] Content-Security-Policy
  - [x] Rate limiting zones for API endpoints
- [x] Fixed npm vulnerabilities (upgraded Next.js to v15.1.0+)
- [x] All critical security headers in place

## Infrastructure

- [x] Docker multi-stage build optimized
- [x] Healthchecks configured for all services
- [x] Docker Compose production profile ready
- [x] Postfix service included for email handling
- [x] Redis with persistence enabled
- [x] PostgreSQL with automatic backups support

## Application

- [x] Build successful (npm run build passes)
- [x] No TypeScript errors
- [x] Prisma schema loaded correctly
- [x] All API endpoints discoverable
- [x] Next.js 15.5.14 with latest security patches

## Configuration

- [x] Environment variables template complete (.env.example)
- [x] Nginx reverse proxy example updated
- [x] Docker Compose configured for production
- [x] Database migrations support verified

## Documentation

- [x] Created PRODUCTION_DEPLOY_GUIDE.md with:
  - [x] Server hardening steps
  - [x] Docker installation
  - [x] Environment setup
  - [x] SSL certificate configuration
  - [x] Cloudflare integration
  - [x] Backup strategy
  - [x] Monitoring and updates
  - [x] Troubleshooting guide
  - [x] Performance tuning
  - [x] Best practices

## Pre-Deployment Tasks

### Before Going Live

- [ ] Generate all secrets with `openssl rand -hex 32`
- [ ] Prepare SSL certificates (full chain + private key)
- [ ] Configure PostgreSQL with strong password
- [ ] Set up Cloudflare account and add domain
- [ ] Configure firewall (UFW) on VPS
- [ ] Install fail2ban for rate limiting
- [ ] Plan backup storage location
- [ ] Set up monitoring/alerting
- [ ] Test database backups and restore
- [ ] Configure email domain for Postfix
- [ ] Test payment integrations if applicable

### Security Hardening

- [ ] Update system packages: `apt update && apt upgrade`
- [ ] Enable firewall with UFW
- [ ] Configure fail2ban rules
- [ ] Set up SSH key-only authentication
- [ ] Disable root login
- [ ] Configure log rotation
- [ ] Set up intrusion detection

### Deployment

- [ ] Clone repository on VPS
- [ ] Copy SSL certificates to `./certs/`
- [ ] Create `.env` with all production values
- [ ] Update Nginx config with domain names
- [ ] Run database migrations: `docker compose --profile production run app npx prisma migrate deploy`
- [ ] Start services: `docker compose --profile production up -d --build`
- [ ] Verify health: `curl https://your-domain/api/health`
- [ ] Check all services running: `docker compose ps`
- [ ] Monitor logs for errors: `docker compose logs -f`

### Post-Deployment

- [ ] Verify HTTPS works correctly
- [ ] Test user registration and login
- [ ] Test email reception and display
- [ ] Verify Cloudflare is caching properly
- [ ] Test rate limiting on API endpoints
- [ ] Monitor server resources (CPU, memory, disk)
- [ ] Set up automated backups
- [ ] Schedule certificate renewal (if using Let's Encrypt)
- [ ] Document admin access and recovery procedures
- [ ] Set up monitoring alerts

## Architecture Overview

```
User Request
    ↓
Cloudflare (WAF, DDoS Protection)
    ↓
Nginx Reverse Proxy (Rate Limiting, SSL Termination)
    ↓
Next.js App (Port 3000)
    ├── Realtime Server (Port 3001, WebSocket)
    ├── Cleanup Worker (background task)
    ├── Payment Retry Worker (background task)
    ├── Postfix Service (Email handling)
    ├── PostgreSQL Database (Port 5432, Internal only)
    └── Redis Cache (Port 6379, Internal only)
```

## Database Schema Overview

- **Users**: Authentication and profiles
- **Mailboxes**: Email addresses for users (FREE, PREMIUM, UNLIMITED tiers)
- **Emails**: Received emails
- **Payments**: Payment records and history
- **Referrals**: Referral tracking and rewards
- **Admin Logs**: Administrative action tracking
- **Domain Tiers**: Mail domain management

## Service Dependencies

```
app → depends_on → [postgres, redis, worker, worker-payment]
worker → depends_on → [postgres, redis]
worker-payment → depends_on → [postgres, redis, worker]
realtime → depends_on → [redis]
postfix → depends_on → [postgres]
proxy → depends_on → [all other services]
```

## Key Features

- ✅ Privacy-first temporary email service
- ✅ Multiple payment methods (Telegram Stars, CryptoBot, Monero)
- ✅ Referral system with withdrawal
- ✅ Real-time email notifications
- ✅ Multiple mailbox tiers (Free, Premium, Unlimited)
- ✅ Admin dashboard with statistics
- ✅ Email auto-cleanup workers
- ✅ Domain management

## Support Resources

- **Documentation**: `docs/` directory
- **Deployment**: `PRODUCTION_DEPLOY_GUIDE.md`
- **README**: `README.md` with quick start
- **Privacy Policy**: `docs/PRIVACY_POLICY_RU.md`
- **Full Spec**: `docs/FULL_TZ_RU.md`

## Next Steps

1. Review all configuration files
2. Follow PRODUCTION_DEPLOY_GUIDE.md for deployment
3. Test in staging environment first
4. Prepare monitoring and alerting
5. Plan disaster recovery procedures
6. Document operational runbooks

---

**Status**: ✅ READY FOR PRODUCTION DEPLOYMENT
**Last Updated**: March 2025
**Version**: 1.0.0
