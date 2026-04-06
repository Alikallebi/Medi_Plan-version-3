# Script de test rapide de la connexion backend
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  TEST CONNEXION DASHBOARD BACKEND" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

$backendUrl = "http://localhost:5239"

# 1. Vérifier si le backend tourne
Write-Host "[1/4] Vérification du processus Backend..." -ForegroundColor Yellow
$backendProcess = Get-Process -Name "Backend" -ErrorAction SilentlyContinue
if ($backendProcess) {
    Write-Host "  ✅ Backend est en cours d'exécution (PID: $($backendProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "  ❌ Backend n'est PAS en cours d'exécution" -ForegroundColor Red
    Write-Host "  💡 Lancez: cd Backend; dotnet run" -ForegroundColor Cyan
    exit 1
}

# 2. Tester l'endpoint statistiques
Write-Host "`n[2/4] Test de l'endpoint /api/structure/statistiques..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$backendUrl/api/structure/statistiques" -UseBasicParsing
    $data = $response.Content | ConvertFrom-Json
    Write-Host "  ✅ Endpoint répond correctement" -ForegroundColor Green
    Write-Host "  📊 Données: $($data.nombrePoles) pôles, $($data.nombreServices) services, $($data.nombreUtilisateurs) utilisateurs" -ForegroundColor Cyan
} catch {
    Write-Host "  ❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Tester l'endpoint planning
Write-Host "`n[3/4] Test de l'endpoint /api/planning/overview..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$backendUrl/api/planning/overview" -UseBasicParsing
    $data = $response.Content | ConvertFrom-Json
    Write-Host "  ✅ Endpoint répond correctement" -ForegroundColor Green
    Write-Host "  📊 Nombre de lignes: $($data.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "  ❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Tester l'endpoint staff
Write-Host "`n[4/4] Test de l'endpoint /api/staff..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$backendUrl/api/staff" -UseBasicParsing
    $data = $response.Content | ConvertFrom-Json
    Write-Host "  ✅ Endpoint répond correctement" -ForegroundColor Green
    Write-Host "  📊 Nombre d'utilisateurs: $($data.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "  ❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Ouvrir la page de test HTML
Write-Host "`n[BONUS] Ouverture de la page de test dans le navigateur..." -ForegroundColor Yellow
$testHtmlPath = Join-Path $PSScriptRoot "test-dashboard-api.html"
if (Test-Path $testHtmlPath) {
    Start-Process $testHtmlPath
    Write-Host "  ✅ Page de test ouverte dans votre navigateur" -ForegroundColor Green
} else {
    Write-Host "  ⚠️ Fichier test-dashboard-api.html non trouve" -ForegroundColor Yellow
}

Write-Host "`n=======================================" -ForegroundColor Cyan
Write-Host "  TESTS TERMINES" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Prochaines etapes:" -ForegroundColor Cyan
Write-Host "  1. Redemarrez le frontend: ng serve" -ForegroundColor White
Write-Host "  2. Ouvrez http://localhost:4200" -ForegroundColor White
Write-Host "  3. Ouvrez DevTools (F12) → Console" -ForegroundColor White
Write-Host "  4. Naviguez vers le Dashboard" -ForegroundColor White
Write-Host "  5. Verifiez les logs 🟢 🔵 ✅" -ForegroundColor White
Write-Host ""
Write-Host "📖 Consultez DEBUG_DASHBOARD.md pour plus d'aide" -ForegroundColor Yellow
