# Script para deploy automático a Render

Write-Host "🚀 Deploying to Render..." -ForegroundColor Cyan
Write-Host ""

# 1. Verificar cambios
Write-Host "📋 Checking for changes..." -ForegroundColor Yellow
$status = git status --porcelain
if (-not $status) {
    Write-Host "✅ No changes to commit" -ForegroundColor Green
} else {
    Write-Host "📝 Changes detected:" -ForegroundColor Yellow
    git status --short
    Write-Host ""
}

# 2. Add all files
Write-Host "📦 Adding files..." -ForegroundColor Yellow
git add .

# 3. Commit
$commitMsg = "fix: Deploy to Render with DuckDB disabled"
Write-Host "💾 Committing: $commitMsg" -ForegroundColor Yellow
git commit -m $commitMsg

# 4. Push
Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Yellow
git push origin main

Write-Host ""
Write-Host "=" * 50 -ForegroundColor Green
Write-Host "✅ Code pushed to GitHub!" -ForegroundColor Green
Write-Host "=" * 50 -ForegroundColor Green
Write-Host ""
Write-Host "📊 Render will now:" -ForegroundColor Cyan
Write-Host "   1. Detect the push" -ForegroundColor White
Write-Host "   2. Start building (8-12 min)" -ForegroundColor White
Write-Host "   3. Deploy automatically" -ForegroundColor White
Write-Host ""
Write-Host "🔗 Monitor deployment at:" -ForegroundColor Yellow
Write-Host "   https://dashboard.render.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "⏱️  Estimated time: 10-15 minutes" -ForegroundColor Yellow
Write-Host ""
Write-Host "🎯 Your API will be live at:" -ForegroundColor Green
Write-Host "   https://crypto-ledger-api.onrender.com/api" -ForegroundColor Cyan
Write-Host ""
