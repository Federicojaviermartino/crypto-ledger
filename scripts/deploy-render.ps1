# Script para facilitar el deploy a Render

Write-Host "🚀 Crypto-Ledger - Deploy to Render" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Verificar git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Git no está instalado" -ForegroundColor Red
    Write-Host "Instala Git desde: https://git-scm.com/downloads" -ForegroundColor Yellow
    exit 1
}

# Verificar si es un repo git
if (-not (Test-Path .git)) {
    Write-Host "📦 Inicializando repositorio Git..." -ForegroundColor Yellow
    git init
    git add .
    git commit -m "Initial commit: Crypto-Ledger complete implementation"
    Write-Host "✅ Git inicializado" -ForegroundColor Green
} else {
    Write-Host "✅ Repositorio Git detectado" -ForegroundColor Green
}

# Verificar cambios pendientes
$status = git status --porcelain
if ($status) {
    Write-Host ""
    Write-Host "📝 Hay cambios pendientes:" -ForegroundColor Yellow
    git status --short
    Write-Host ""
    $commit = Read-Host "¿Hacer commit de los cambios? (y/n)"
    
    if ($commit -eq "y") {
        $message = Read-Host "Mensaje del commit"
        git add .
        git commit -m $message
        Write-Host "✅ Commit realizado" -ForegroundColor Green
    }
}

# Verificar remote
$remote = git remote get-url origin 2>$null
if (-not $remote) {
    Write-Host ""
    Write-Host "🔗 Configurar repositorio remoto" -ForegroundColor Yellow
    Write-Host "1. Ve a https://github.com/new" -ForegroundColor Cyan
    Write-Host "2. Crea un nuevo repositorio llamado 'crypto-ledger'" -ForegroundColor Cyan
    Write-Host "3. NO inicialices con README" -ForegroundColor Cyan
    Write-Host ""
    
    $username = Read-Host "Tu usuario de GitHub"
    $repoUrl = "https://github.com/$username/crypto-ledger.git"
    
    git remote add origin $repoUrl
    Write-Host "✅ Remote configurado: $repoUrl" -ForegroundColor Green
} else {
    Write-Host "✅ Remote configurado: $remote" -ForegroundColor Green
}

# Push a GitHub
Write-Host ""
Write-Host "📤 Subiendo a GitHub..." -ForegroundColor Yellow
git branch -M main
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Código subido a GitHub exitosamente" -ForegroundColor Green
} else {
    Write-Host "❌ Error al subir a GitHub" -ForegroundColor Red
    Write-Host "Verifica tus credenciales de GitHub" -ForegroundColor Yellow
    exit 1
}

# Instrucciones para Render
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "🎯 Próximos pasos en Render:" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Ve a https://render.com" -ForegroundColor White
Write-Host "2. Regístrate/Inicia sesión con GitHub" -ForegroundColor White
Write-Host "3. Click en 'New +' → 'Blueprint'" -ForegroundColor White
Write-Host "4. Selecciona el repositorio 'crypto-ledger'" -ForegroundColor White
Write-Host "5. Click en 'Apply'" -ForegroundColor White
Write-Host "6. Espera 5-10 minutos mientras se despliega" -ForegroundColor White
Write-Host ""
Write-Host "📖 Lee DEPLOY_GUIDE.md para más detalles" -ForegroundColor Yellow
Write-Host ""
Write-Host "✨ ¡Deploy iniciado!" -ForegroundColor Green
