# Deploy script for Render

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git not installed"
    exit 1
}

if (-not (Test-Path .git)) {
    git init
    git add .
    git commit -m "Initial commit"
}

$status = git status --porcelain
if ($status) {
    $commit = Read-Host "Commit changes? (y/n)"
    if ($commit -eq "y") {
        $message = Read-Host "Commit message"
        git add .
        git commit -m $message
    }
}

$remote = git remote get-url origin 2>$null
if (-not $remote) {
    $username = Read-Host "GitHub username"
    $repoUrl = "https://github.com/$username/crypto-ledger.git"
    git remote add origin $repoUrl
}

git branch -M main
git push -u origin main

if ($LASTEXITCODE -ne 0) {
    Write-Error "Push failed"
    exit 1
}

Write-Host "Deploy to Render: https://render.com" -ForegroundColor Green
