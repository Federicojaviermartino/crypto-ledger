# Auto-deploy to Render

$status = git status --porcelain
git add .

$commitMsg = Read-Host "Commit message"
if (-not $commitMsg) {
    $commitMsg = "Update: Production deployment"
}

git commit -m $commitMsg
git push origin main

Write-Host "Deployment initiated. Monitor at: https://dashboard.render.com" -ForegroundColor Green
