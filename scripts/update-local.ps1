param([Parameter(Mandatory = $true)][string]$Target)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
. (Join-Path $PSScriptRoot 'update-core.ps1')

$Target = [IO.Path]::GetFullPath($Target).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
$work = Join-Path ([IO.Path]::GetTempPath()) ('huanhuan-download-' + [Guid]::NewGuid().ToString('N'))
$lock = $null
$client = $null
$reservation = $null
$marked = $false
$activePath = Join-Path $Target '.huanhuan-update-active.json'

function Get-UpdateDownload([string]$Url, [string]$Path, [long]$Limit) {
    $reply = $client.GetAsync($Url, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    try {
        $reply.EnsureSuccessStatusCode() | Out-Null
        if ($reply.Content.Headers.ContentLength -gt $Limit) { throw '下载内容过大，已停止。' }
        $inputStream = $reply.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $output = [IO.File]::Open($Path, [IO.FileMode]::CreateNew)
        try {
            $buffer = New-Object byte[] 65536
            $total = 0L
            $deadline = [DateTime]::UtcNow.AddMinutes(3)
            while ($true) {
                $read = $inputStream.ReadAsync($buffer, 0, $buffer.Length)
                if (-not $read.Wait(30000)) { throw '下载等待超时。请检查网络后重试。' }
                $count = $read.Result
                if ($count -eq 0) { break }
                $total += $count
                if ($total -gt $Limit -or [DateTime]::UtcNow -gt $deadline) { throw '下载内容过大或耗时过长，已停止。' }
                $output.Write($buffer, 0, $count)
            }
        } finally { $inputStream.Dispose(); $output.Dispose() }
    } finally { $reply.Dispose() }
}

try {
    Assert-UpdateRoot $Target
    $lockPath = Join-Path $Target '.huanhuan-lock'
    if (Test-Path -LiteralPath $lockPath) {
        if (((Get-Item -LiteralPath $lockPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw '更新锁文件无效。' }
    }
    try { $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch { throw '另一个更新窗口可能正在运行，或此文件夹不可写。请关闭重复窗口后重试。' }
    Write-Host '缓缓 · 检查并更新本地程序'
    Write-Host "更新位置：$Target"
    Write-Host '请先在应用内备份记录，并关闭所有缓缓网页和启动器窗口。'
    Write-Host '更新不会上传私人内容。请继续使用原来的浏览器和打开方式。'
    Read-Host '准备好后按 Enter，取消请关闭此窗口' | Out-Null
    Add-Type -AssemblyName System.Net.Http
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $handler = New-Object Net.Http.HttpClientHandler
    $client = New-Object Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(30)
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('Huanhuan-Updater/1.0')
    # Reserve the fixed launcher port throughout the update. This also prevents
    # an older launcher (which does not know our marker) from starting mid-copy.
    try {
        $reservation = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 4173)
        $reservation.ExclusiveAddressUse = $true
        $reservation.Start(1)
    } catch { throw '本机 4173 端口仍在使用或无法保留。请先在缓缓启动器窗口按 Ctrl+C 停止，再更新。' }
    if ([IO.File]::Exists($activePath)) { [IO.File]::Delete($activePath) }
    Write-UpdateJson $activePath @{ app = 'huanhuan'; startedAt = [DateTime]::UtcNow.ToString('o') }
    $marked = $true
    if (Restore-HuanhuanUpdate $Target) { Write-Host '已恢复上次未完成的更新，现在检查新版本。' }
    $current = Read-UpdateJson (Get-UpdatePath $Target 'package.json')
    if ($current.name -ne 'huanhuan') { throw '这不是缓缓文件夹，请将更新入口放回原来的缓缓文件夹。' }
    [IO.Directory]::CreateDirectory($work) | Out-Null
    $base = 'https://raw.githubusercontent.com/zhangguangfang/wendao/main/downloads/'
    $manifestPath = Join-Path $work 'update.json'
    Get-UpdateDownload ($base + 'update.json') $manifestPath 65536
    $manifest = Read-UpdateJson $manifestPath
    if ($manifest.app -ne 'huanhuan' -or $manifest.format -ne 1 -or $manifest.version -notmatch '^\d+\.\d+\.\d+$') { throw '无法识别更新信息。' }
    if ([version]$manifest.version -lt [version]$current.version) { throw '本地版本比发布版本新，已保留本地程序。' }
    Write-Host "当前 v$($current.version)，发布 v$($manifest.version)。正在下载并校验……"
    $archive = Join-Path $work 'huanhuan.zip'
    Get-UpdateDownload ($base + 'huanhuan-windows.zip') $archive (20MB)
    $staging = Join-Path $work 'package'
    $incomingVersion = Expand-VerifiedUpdate $archive $staging $manifest.sha256 $manifest.bytes
    if ($incomingVersion -ne $manifest.version) { throw '包内版本与更新信息不同，已停止更新。' }
    $result = Install-HuanhuanUpdate $Target $staging
    if ($result.changed) {
        Write-Host "更新完成：缓缓 v$($result.version)"
        Write-Host "旧程序备份：$($result.backup)"
    } else { Write-Host "已经是最新的完整版本：缓缓 v$($result.version)，未重复创建备份。" }
    Write-Host '请用原来的方式重新打开缓缓，核对页脚版本，并查看《验收与审查报告.md》。'
    Write-Host '程序备份不包含浏览器记录；私人记录请在应用的“隐私与数据”中另行备份。'
} catch {
    Write-Host "未完成更新：$($_.Exception.Message)" -ForegroundColor Red
    if ([IO.File]::Exists((Join-Path $Target '.huanhuan-update.json'))) {
        Write-Host '检测到待恢复的更新，请保留原文件夹和程序备份，再次运行更新入口以恢复。若仍失败，请保留此错误信息，暂勿手动覆盖文件。'
    } else {
        Write-Host '请保留原文件夹。网络不可用时，可到 GitHub 下载完整运行包，解压到相同位置。'
    }
    exit 1
} finally {
    if ($null -ne $client) { $client.Dispose() }
    if ($marked -and [IO.File]::Exists($activePath)) { [IO.File]::Delete($activePath) }
    if ($null -ne $reservation) { $reservation.Stop() }
    if ($null -ne $lock) { $lock.Dispose() }
    if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
