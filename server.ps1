# server.ps1 — локальный HTTP-сервер для игры
param([int]$Port = 5501)

$root = $PSScriptRoot
$url  = "http://localhost:$Port/"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.mp3'  = 'audio/mpeg'
  '.mp4'  = 'video/mp4'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.webp' = 'image/webp'
  '.woff' = 'font/woff'
  '.woff2'= 'font/woff2'
  '.json' = 'application/json'
}

# Освобождаем порт если занят
$old = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($old) {
  $old | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 400
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try { $listener.Start() } catch {
  Write-Host " [!] Не удалось занять порт $Port." -ForegroundColor Red
  Start-Sleep 3; exit 1
}

Write-Host ""
Write-Host "  Сервер запущен: $url" -ForegroundColor Green
Write-Host "  Закрой это окно чтобы остановить игру." -ForegroundColor DarkGray
Write-Host ""

# Открыть браузер
Start-Sleep -Milliseconds 300
Start-Process $url

# Обработка запросов
while ($listener.IsListening) {
  try {
    $ctx  = $listener.GetContext()
    $req  = $ctx.Request
    $resp = $ctx.Response

    $path = $req.Url.LocalPath -replace '/', '\'
    if ($path -eq '\') { $path = '\index.html' }
    $file = Join-Path $root $path.TrimStart('\')

    if (Test-Path $file -PathType Leaf) {
      $ext     = [System.IO.Path]::GetExtension($file).ToLower()
      $ct      = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes   = [System.IO.File]::ReadAllBytes($file)
      $resp.ContentType   = $ct
      $resp.ContentLength64 = $bytes.Length
      $resp.Headers.Add("Accept-Ranges", "bytes")
      $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $resp.StatusCode = 404
    }
    $resp.OutputStream.Close()
  } catch { }
}
