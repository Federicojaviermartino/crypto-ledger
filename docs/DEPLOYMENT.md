# Crypto-Ledger Deployment Guide

## Production Deployment

### Prerequisites
- Docker & Docker Compose
- SSL certificate (Let's Encrypt)
- Domain name configured

### 1. Environment Setup

```bash
# Copy and configure production env
cp .env.example .env.production

# Edit with production values
nano .env.production
```

Required variables:
```bash
DATABASE_URL=postgresql://ledger_user:STRONG_PASSWORD@postgres:5432/crypto_ledger_prod
JWT_SECRET=use_openssl_rand_base64_64
REDIS_PASSWORD=STRONG_PASSWORD
```

### 2. SSL Certificates

```bash
# Using Let's Encrypt
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./ssl/
```

### 3. Deploy

```bash
# Build and start
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f api
```

### 4. Database Migration

```bash
# Run migrations
docker-compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Seed initial data
docker-compose -f docker-compose.prod.yml exec api npm run db:seed
```

### 5. Verification

```bash
# Health check
curl https://yourdomain.com/api/health

# Expected: {"status":"healthy",...}
```

## Monitoring

### Logs
```bash
# API logs
docker-compose logs -f api

# Database logs
docker-compose logs -f postgres

# All services
docker-compose logs -f
```

### Backup

```bash
# Database backup
docker-compose exec postgres pg_dump -U ledger_user crypto_ledger_prod | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore
gunzip < backup_20250115.sql.gz | docker-compose exec -T postgres psql -U ledger_user crypto_ledger_prod
```

## Scaling

```bash
# Scale API servers
docker-compose -f docker-compose.prod.yml up -d --scale api=3

# Nginx will load balance automatically
```

## Troubleshooting

### API not responding
```bash
docker-compose restart api
docker-compose logs api
```

### Database connection issues
```bash
docker-compose exec postgres psql -U ledger_user crypto_ledger_prod
```

### Clear Redis cache
```bash
docker-compose exec redis redis-cli -a $REDIS_PASSWORD FLUSHALL
```

