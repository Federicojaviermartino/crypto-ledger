# 🚀 Guía de Despliegue - GitHub + Render

## Paso 1: Preparar el Proyecto

```powershell
# Asegúrate de que todo funciona localmente
npm install
npm run prisma:generate
npm run build
npm test
```

## Paso 2: Subir a GitHub

### 2.1 Inicializar Git (si no está inicializado)
```powershell
git init
git add .
git commit -m "Initial commit: Crypto-Ledger complete implementation"
```

### 2.2 Crear Repositorio en GitHub
1. Ve a https://github.com/new
2. Nombre: `crypto-ledger`
3. Descripción: "Enterprise accounting ledger for crypto businesses"
4. Público o Privado (tu elección)
5. NO inicialices con README (ya tienes uno)
6. Crea el repositorio

### 2.3 Conectar y Subir
```powershell
# Reemplaza TU_USUARIO con tu usuario de GitHub
git remote add origin https://github.com/TU_USUARIO/crypto-ledger.git
git branch -M main
git push -u origin main
```

## Paso 3: Desplegar en Render

### 3.1 Crear Cuenta en Render
1. Ve a https://render.com
2. Regístrate con GitHub (recomendado)
3. Autoriza acceso a tus repositorios

### 3.2 Opción A: Deploy Automático con render.yaml

1. **Crear New → Blueprint**
2. Selecciona tu repositorio `crypto-ledger`
3. Render detectará automáticamente `render.yaml`
4. Click en **Apply**
5. Espera a que se creen los servicios (5-10 min)

### 3.3 Opción B: Deploy Manual

#### Crear PostgreSQL Database
1. **New → PostgreSQL**
2. Nombre: `crypto-ledger-db`
3. Database: `crypto_ledger_prod`
4. User: `ledger_user`
5. Region: Oregon (más cercano)
6. Plan: Free (para empezar)
7. Create Database

#### Crear Redis
1. **New → Redis**
2. Nombre: `crypto-ledger-redis`
3. Region: Oregon
4. Plan: Free
5. Create Redis

#### Crear Web Service
1. **New → Web Service**
2. Conecta tu repo `crypto-ledger`
3. Configuración:
   - **Name:** `crypto-ledger-api`
   - **Region:** Oregon
   - **Branch:** main
   - **Root Directory:** (dejar vacío)
   - **Environment:** Node
   - **Build Command:**
     ```bash
     npm install && npx prisma generate && npm run build
     ```
   - **Start Command:**
     ```bash
     npm run start
     ```
   - **Plan:** Free (para empezar)

4. **Environment Variables** (Add Environment Variable):
   ```
   NODE_ENV=production
   PORT=3000
   DATABASE_URL=[PostgreSQL Internal URL]
   REDIS_HOST=[Redis Internal Hostname]
   REDIS_PORT=[Redis Internal Port]
   JWT_SECRET=[Generate Random]
   JWT_EXPIRES_IN=15m
   REFRESH_TOKEN_EXPIRES_IN=7d
   CORS_ORIGIN=*
   ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
   COINGECKO_API_KEY=(opcional)
   FUNCTIONAL_CURRENCY=USD
   LOG_LEVEL=info
   ```

5. Click **Create Web Service**

### 3.4 Ejecutar Migraciones

Una vez desplegado:

1. Ve a tu servicio en Render
2. Click en **Shell** (botón arriba a la derecha)
3. Ejecuta:
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```

## Paso 4: Verificar Deployment

### 4.1 Health Check
```bash
curl https://crypto-ledger-api.onrender.com/api/health
```

**Respuesta esperada:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-20T...",
  "checks": {
    "database": "up"
  }
}
```

### 4.2 Test API
```bash
# Crear entrada
curl -X POST https://crypto-ledger-api.onrender.com/api/entries \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-01-20",
    "description": "Test entry",
    "postings": [
      {"accountCode": "1000", "debit": 100},
      {"accountCode": "4000", "credit": 100}
    ]
  }'
```

## Paso 5: Configurar Dominio Personalizado (Opcional)

### En Render:
1. Ve a tu servicio
2. Settings → Custom Domains
3. Add Custom Domain
4. Sigue instrucciones para configurar DNS

### Ejemplo con tu dominio:
- CNAME: `api.tudominio.com` → `crypto-ledger-api.onrender.com`

## Paso 6: Monitoreo

### Logs en Render:
1. Ve a tu servicio
2. Click en **Logs** (botón arriba)
3. Verás logs en tiempo real

### Métricas:
1. Click en **Metrics**
2. Verás CPU, memoria, requests

### Alerts (Plan pagado):
1. Settings → Notifications
2. Configura alertas por email/Slack

## URLs Finales

Después del deploy, tendrás:

