# LoopX Local — Setup Windows (RTX 2070 + 64GB RAM)
# Executar como administrador: PowerShell -ExecutionPolicy Bypass -File setup-windows.ps1

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  LoopX Local — Instalacao Windows" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Git
Write-Host "[1/8] Instalando Git..." -ForegroundColor Yellow
winget install Git.Git --accept-package-agreements --accept-source-agreements 2>$null
Write-Host ""

# 2. Node.js 20 LTS
Write-Host "[2/8] Instalando Node.js 20 LTS..." -ForegroundColor Yellow
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements 2>$null
Write-Host ""

# 3. Python 3.12
Write-Host "[3/8] Instalando Python 3.12..." -ForegroundColor Yellow
winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements 2>$null
Write-Host ""

# 4. FFmpeg
Write-Host "[4/8] Instalando FFmpeg..." -ForegroundColor Yellow
winget install Gyan.FFmpeg --accept-package-agreements --accept-source-agreements 2>$null
Write-Host ""

# 5. Obsidian
Write-Host "[5/8] Instalando Obsidian..." -ForegroundColor Yellow
winget install Obsidian.Obsidian --accept-package-agreements --accept-source-agreements 2>$null
Write-Host ""

# 6. Chrome
Write-Host "[6/8] Verificando Chrome..." -ForegroundColor Yellow
$chrome = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" -ErrorAction SilentlyContinue
if ($chrome) {
    Write-Host "  Chrome ja instalado" -ForegroundColor Green
} else {
    winget install Google.Chrome --accept-package-agreements --accept-source-agreements 2>$null
}
Write-Host ""

# 7. PyTorch + CUDA + Whisper + TTS deps
Write-Host "[7/8] Instalando PyTorch (CUDA 12.1) + Whisper + TTS..." -ForegroundColor Yellow
Write-Host "  Isso pode demorar alguns minutos..." -ForegroundColor Gray

# Refresh PATH to pick up pip
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install openai-whisper
pip install transformers accelerate soundfile numpy
Write-Host ""

# 8. Claude Code CLI
Write-Host "[8/8] Instalando Claude Code CLI..." -ForegroundColor Yellow
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
npm install -g @anthropic-ai/claude-code
Write-Host ""

# SSH key
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Configuracao SSH" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

$sshKey = "$env:USERPROFILE\.ssh\id_ed25519"
if (Test-Path $sshKey) {
    Write-Host "  SSH key ja existe: $sshKey" -ForegroundColor Green
} else {
    Write-Host "  Gerando SSH key..." -ForegroundColor Yellow
    ssh-keygen -t ed25519 -f $sshKey -N '""'
    Write-Host ""
    Write-Host "  IMPORTANTE: Adicionar esta chave no Hetzner:" -ForegroundColor Red
    Write-Host ""
    Get-Content "$sshKey.pub"
    Write-Host ""
    Write-Host "  Comando: ssh root@65.109.85.250 `"cat >> ~/.ssh/authorized_keys`"" -ForegroundColor Gray
}

# Criar pasta de trabalho
$workDir = "$env:USERPROFILE\Documents\YOUTUBE\scripts"
if (-not (Test-Path $workDir)) {
    New-Item -ItemType Directory -Path $workDir -Force | Out-Null
    Write-Host "  Pasta criada: $workDir" -ForegroundColor Green
}

# Copiar skills do Claude Code
$claudeDir = "$env:USERPROFILE\.claude\commands"
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
    Write-Host "  Pasta criada: $claudeDir" -ForegroundColor Green
    Write-Host "  LEMBRETE: Copiar skills (.md) do Mac pra ca" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Instalacao concluida!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Verificacao:" -ForegroundColor Cyan
Write-Host "  Fechar e reabrir o terminal, depois rodar:" -ForegroundColor Gray
Write-Host "    node --version" -ForegroundColor White
Write-Host "    python --version" -ForegroundColor White
Write-Host "    ffmpeg -version" -ForegroundColor White
Write-Host "    whisper --help" -ForegroundColor White
Write-Host "    claude --version" -ForegroundColor White
Write-Host '    python -c "import torch; print(torch.cuda.is_available())"' -ForegroundColor White
Write-Host "    ssh root@65.109.85.250 'echo ok'" -ForegroundColor White
