# 🚀 Guía de Deploy a Producción en Render

## Pasos Rápidos

### Opción 1: Script Automático

```powershell
# Ejecutar script de deploy
.\scripts\deploy-to-render.ps1
```

### Opción 2: Manual

```powershell
# 1. Add cambios
git add .

# 2. Commit
git commit -m "fix: Deploy to Render with DuckDB disabled"

# 3. Push a GitHub
git push origin main
```

## Verificar Deploy

### 1. Monitorear en Render Dashboard

1. Ve a https://dashboard.render.com
2. Click en tu servicio `crypto-ledger-api`
3. Verás el log del build en tiempo real

### 2. Estados del Deploy

**Building (5-10 min):**
