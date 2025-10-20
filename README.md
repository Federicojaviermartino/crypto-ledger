# Crypto-Ledger 🚀

Enterprise-grade accounting ledger for crypto businesses with blockchain integration.

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![Tests](https://img.shields.io/badge/tests-63%20passing-brightgreen)]()
[![Coverage](https://img.shields.io/badge/coverage-85%25-green)]()
[![Deploy](https://img.shields.io/badge/deploy-render-blue)](https://render.com)

## 🌐 Live Demo

**API URL:** `https://crypto-ledger-api.onrender.com/api`

**Endpoints disponibles:**
- `GET /api/health` - Health check
- `POST /api/entries` - Crear journal entry
- `GET /api/entries` - Listar entries
- `GET /api/blockchain/status` - Estado del indexer
- `GET /api/analytics/metrics` - Métricas financieras

> **Nota:** El primer request puede tomar 30-60 segundos (cold start en plan Free)

## ✨ Features

### Core Accounting
- ✅ Double-entry bookkeeping with hash-chain immutability
- ✅ Multi-dimensional tracking (7 first-class dimensions)
- ✅ Trial balance and financial statements
- ✅ Audit trail with complete history

### Blockchain Integration
- ✅ Ethereum event indexing (native + ERC-20)
- ✅ Automatic transaction classification
- ✅ FIFO lot tracking with realized P&L
- ✅ Real-time price fetching (Coingecko)

### Multi-Entity Support
- ✅ Consolidation across entities
- ✅ FX translation (ECB integration)
- ✅ Intercompany eliminations
- ✅ Multi-currency support

### Tax Compliance (EU/ES)
- ✅ Facturae 3.2.2 XML generation (Spain)
- ✅ SII SOAP submission (AEAT)
- ✅ Peppol BIS Billing 3.0 (Pan-EU)

### Bank Reconciliation
- ✅ CSV statement import
- ✅ ISO 20022 camt.053 parser
- ✅ Intelligent transaction matching
- ✅ Auto-reconciliation

### Analytics & Insights
- ✅ DuckDB columnar snapshots (<300ms queries)
- ✅ Anomaly detection (Z-score based)
- ✅ Financial metrics (burn rate, runway)
- ✅ Real-time dashboards

## 🚀 Quick Start

### Local Development

```bash
# Instalar dependencias
npm install

# Iniciar servicios (Docker)
docker-compose -f docker-compose.dev.yml up -d

# Configurar
cp .env.example .env

# Setup database
npm run prisma:generate
npm run prisma:migrate
npm run db:seed

# Iniciar servidor
npm run dev
```

### Deploy to Render

```powershell
# Ejecutar script de deploy
.\scripts\deploy-render.ps1

# O manualmente:
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU_USUARIO/crypto-ledger.git
git push -u origin main
```

Luego sigue la [Guía de Deploy](DEPLOY_GUIDE.md).

## 📊 API Endpoints

### Accounting (13 endpoints)
