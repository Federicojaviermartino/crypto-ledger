# 🚀 Crypto-Ledger - Inicio Rápido

## Pasos para Probar el Sistema

### 1. Instalar Dependencias
```powershell
npm install
```

### 2. Iniciar Infraestructura (Docker)
```powershell
docker-compose -f docker-compose.dev.yml up -d
```

### 3. Configurar Variables de Entorno
```powershell
Copy-Item .env.example .env
# Edita .env si necesitas cambiar algo
```

### 4. Configurar Base de Datos
```powershell
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
```

### 5. Iniciar Servidor
```powershell
npm run dev
```

### 6. Probar API (en otra terminal)
```powershell
# Health check
curl http://localhost:3000/api/health

# Test automatizado
npm run test:system
```

## Troubleshooting

### Si Docker no está instalado:
1. Instala PostgreSQL: https://www.postgresql.org/download/windows/
2. Instala Redis: https://github.com/microsoftarchive/redis/releases
3. Ajusta DATABASE_URL en .env

### Si el puerto 3000 está ocupado:
Cambia `PORT=3001` en .env

### Si hay errores de Prisma:
```powershell
npm run prisma:generate
npx prisma migrate reset
```

## URLs Importantes
- API: http://localhost:3000/api
- Health: http://localhost:3000/api/health  
- Prisma Studio: http://localhost:5555 (ejecuta `npm run prisma:studio`)

## Endpoints Disponibles
- POST /api/entries - Crear entrada
- GET /api/entries - Listar entradas
- GET /api/entries/verify/chain - Verificar hash chain
- GET /api/accounts - Listar cuentas
- GET /api/dimensions - Listar dimensiones
