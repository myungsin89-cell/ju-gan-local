$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 5174
$Prefix = "http://localhost:$Port/"

Add-Type -AssemblyName System.Web

function Get-ContentType($Path) {
    switch ([IO.Path]::GetExtension($Path).ToLower()) {
        '.html' { 'text/html; charset=utf-8' }
        '.css'  { 'text/css; charset=utf-8' }
        '.js'   { 'application/javascript; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.svg'  { 'image/svg+xml' }
        default { 'application/octet-stream' }
    }
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($Prefix)

try {
    $listener.Start()
} catch {
    Start-Process $Prefix
    Write-Host "이미 실행 중인 주간학습 PWA 서버가 있으면 열린 브라우저 창을 사용하세요."
    exit
}

Start-Process $Prefix
Write-Host "주간학습 PWA 서버 실행 중: $Prefix"
Write-Host "처음 한 번은 브라우저의 '앱 설치' 버튼을 눌러 바탕화면 앱으로 설치하세요."
Write-Host "이 창은 주간학습을 사용하는 동안 닫지 마세요. 종료하려면 Ctrl+C를 누르세요."

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        try {
            $rawPath = [System.Web.HttpUtility]::UrlDecode($ctx.Request.Url.AbsolutePath.TrimStart('/'))
            if ([string]::IsNullOrWhiteSpace($rawPath)) { $rawPath = 'index.html' }
            $candidate = [IO.Path]::GetFullPath((Join-Path $Root $rawPath))
            $rootFull = [IO.Path]::GetFullPath($Root)

            if (-not $candidate.StartsWith($rootFull)) {
                $ctx.Response.StatusCode = 403
                $bytes = [Text.Encoding]::UTF8.GetBytes('Forbidden')
            } elseif (-not (Test-Path $candidate -PathType Leaf)) {
                $ctx.Response.StatusCode = 404
                $bytes = [Text.Encoding]::UTF8.GetBytes('Not Found')
            } else {
                $ctx.Response.StatusCode = 200
                $ctx.Response.ContentType = Get-ContentType $candidate
                $bytes = [IO.File]::ReadAllBytes($candidate)
            }

            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            $ctx.Response.StatusCode = 500
            $bytes = [Text.Encoding]::UTF8.GetBytes($_.Exception.Message)
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } finally {
            $ctx.Response.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
