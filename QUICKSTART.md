# Crypto-Ledger - Quick Start Guide ⚡

## 🚀 Get Started in 5 Minutes

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Redis 7+

### 1. Clone & Install

```bash
cd crypto-ledger
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env

# Edit .env with your settings
# Minimum required:
# - DATABASE_URL
# - JWT_SECRET
# - REDIS_HOST
```

### 3. Setup Database

```bash
# Create database
createdb crypto_ledger_dev

# Run migrations
npm run prisma:migrate

# Seed initial data
npm run db:seed
```

### 4. Start Development

```bash
# Terminal 1 - API Server
npm run dev

# Terminal 2 - Ethereum Indexer Worker
npm run worker:ethereum-indexer

# Terminal 3 - Classification Worker
npm run worker:classification
```

### 5. Verify Installation

```bash
# Health check
curl http://localhost:3000/api/health

# Should return: {"status":"healthy",...}

# Run tests
npm run test:e2e
```

---

## 📋 Essential Commands

### Development
```bash
npm run dev              # Start API server (port 3000)
npm run test            # Run unit tests
npm run test:e2e        # Run E2E tests (63 tests)
npm run validate        # Validate system integrity
```

### Database
```bash
npm run prisma:migrate  # Run migrations
npm run prisma:studio   # Open Prisma Studio
npm run db:seed         # Seed initial data
```

### Workers
```bash
npm run worker:ethereum-indexer      # Index blockchain events
npm run worker:classification        # Classify transactions
npm run worker:reconciliation        # Reconcile wallets
npm run worker:snapshot             # Build DuckDB snapshots
npm run worker:sii                  # Submit to SII (Spain)
```

---

## 🎯 Quick Examples

### 1. Create Journal Entry

```bash
curl -X POST http://localhost:3000/api/entries \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-01-15",
    "description": "First entry",
    "postings": [
      {"accountCode": "1000", "debit": 1000},
      {"accountCode": "4000", "credit": 1000}
    ]
  }'
```

### 2. Import Bank Statement

```bash
curl -X POST http://localhost:3000/api/reconciliation/bank/{bankAccountId}/import/csv \
  -F "file=@statement.csv" \
  -F "statementDate=2025-01-31"
```

### 3. Generate Facturae Invoice

```bash
# 1. Create invoice
curl -X POST http://localhost:3000/api/invoices \
  -H "Content-Type: application/json" \
  -d '{...invoice data...}'

# 2. Generate Facturae XML
curl -X POST http://localhost:3000/api/invoices/{id}/facturae

# 3. Download XML
curl http://localhost:3000/api/invoices/{id}/facturae.xml > invoice.xml
```

### 4. Get Financial Metrics

```bash
curl http://localhost:3000/api/analytics/metrics?asOfDate=2025-01-31
```

---

## 🐳 Docker Quick Start

```bash
# Production deployment
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api

# Stop
docker-compose down
```

---

## 📊 API Endpoints Summary

### Core (13 endpoints)
- `/api/entries` - Journal entries
- `/api/accounts` - Chart of accounts
- `/api/dimensions` - Dimensional values

### Blockchain (12 endpoints)
- `/api/blockchain/events` - Blockchain events
- `/api/lots` - FIFO lot tracking
- `/api/pricing` - Asset prices

### Tax (18 endpoints)
- `/api/invoices` - Invoice management
- `/api/parties` - Customers/suppliers
- `/api/invoices/:id/facturae` - Facturae XML
- `/api/invoices/:id/peppol` - Peppol UBL

### Reconciliation (6 endpoints)
- `/api/reconciliation/bank/:id/import/csv`
- `/api/reconciliation/transactions/:id/matches`
- `/api/reconciliation/bank/:id/auto-reconcile`

### Multi-Entity (10 endpoints)
- `/api/entities` - Entity management
- `/api/consolidations` - Consolidation
- `/api/consolidations/fx-rates` - FX rates

### Analytics (5 endpoints)
- `/api/analytics/snapshots` - DuckDB snapshots
- `/api/analytics/anomalies` - Anomaly detection
- `/api/analytics/metrics` - Financial KPIs

---

## 🧪 Testing

```bash
# All tests
npm run test:e2e                    # 63 tests, ~60s

# Specific modules
npm run test:blockchain             # 15 tests
npm run test:lots                   # 12 tests
npm run test:invoices              # 20 tests
npm run test:reconciliation        # 12 tests

# Coverage
npm run test:cov                   # 85%+ coverage
```

---

## 🔧 Troubleshooting

### Database connection error
```bash
# Check PostgreSQL is running
pg_isready

# Verify DATABASE_URL in .env
echo $DATABASE_URL
```

### Redis connection error
```bash
# Check Redis is running
redis-cli ping
# Should return: PONG
```

### Migration errors
```bash
# Reset database (⚠️ DANGER: deletes all data)
npx prisma migrate reset

# Generate Prisma client
npx prisma generate
```

### Worker not processing
```bash
# Check Redis queue
redis-cli
> LLEN bull:ethereum-indexer:wait

# Clear failed jobs
> DEL bull:ethereum-indexer:failed
```

---

## 📚 Next Steps

1. **Read Full Documentation**
   - [README.md](README.md) - Complete overview
   - [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Production deployment
   - [API.md](docs/API.md) - API reference

2. **Configure for Your Business**
   - Update chart of accounts
   - Configure dimensions
   - Set up entities
   - Add bank accounts

3. **Production Deployment**
   - Follow [DEPLOYMENT.md](docs/DEPLOYMENT.md)
   - Configure SSL certificates
   - Set up monitoring
   - Configure backups

4. **Customize**
   - Add custom classification rules
   - Configure tax settings
   - Set up reconciliation rules
   - Customize reports

---

## 💡 Pro Tips

### Performance
```bash
# Build DuckDB snapshot for fast queries
curl -X POST http://localhost:3000/api/analytics/snapshots \
  -d '{"asOfDate":"2025-01-31"}'

# Query will be <50ms instead of >2000ms
```

### Auto-Reconciliation
```bash
# Reconcile bank account automatically
curl -X POST http://localhost:3000/api/reconciliation/bank/{id}/auto-reconcile \
  -d '{"minScore":0.95}'
```

### Anomaly Detection
```bash
# Detect anomalies monthly
curl -X POST http://localhost:3000/api/analytics/anomalies/detect \
  -d '{"startDate":"2025-01-01","endDate":"2025-01-31"}'
```

---

## 🎓 Learning Resources

### Code Examples
- [apps/api/test/*.e2e-spec.ts](apps/api/test/) - E2E test examples
- [packages/db/seed.ts](packages/db/seed.ts) - Database seeding
- [docs/](docs/) - Full documentation

### Architecture
