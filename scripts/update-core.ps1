# Compatible with Windows PowerShell 5.1. No modules or administrator access needed.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-UpdatePath([string]$Name) {
    if ([string]::IsNullOrWhiteSpace($Name) -or $Name.Length -gt 200 -or
        $Name -match '[\\:\x00-\x1f\x7f]' -or $Name.StartsWith('/') -or $Name.EndsWith('/')) {
        throw '更新包包含不支持的文件路径。'
    }
    foreach ($part in $Name.Split('/')) {
        if ($part -in @('', '.', '..') -or $part -match '[<>"|?*]' -or $part -match '[ .]$' -or
            $part -match '^(?i:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)' -or
            $part -match '^(?i:\.git|node_modules|\.huanhuan-update.*|\.huanhuan-lock)$') {
            throw '更新包包含不安全或保留的文件路径。'
        }
    }
}

function Get-UpdatePath([string]$Root, [string]$Name) {
    Assert-UpdatePath $Name
    $path = $Root
    foreach ($part in $Name.Split('/')) {
        $path = Join-Path $path $part
        if (Test-Path -LiteralPath $path) {
            $item = Get-Item -LiteralPath $path -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw '更新路径中存在链接或重定向目录。请使用解压到普通文件夹的缓缓。'
            }
        }
    }
    return $path
}

function Assert-UpdateRoot([string]$Root) {
    $item = Get-Item -LiteralPath $Root -Force
    if (-not $item.PSIsContainer) { throw '未找到缓缓文件夹。' }
    while ($null -ne $item) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw '请在普通文件夹中更新，暂不支持链接或重定向目录。'
        }
        $item = $item.Parent
    }
}

function Get-UpdateHash([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-UpdateJson([string]$Path, $Value) {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 12))
    $temporary = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
        [IO.File]::Move($temporary, $Path)
    } finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
}

function Read-UpdateJson([string]$Path) {
    if ((Get-Item -LiteralPath $Path -Force).Length -gt 2MB) { throw '更新清单过大。' }
    return ([IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) | ConvertFrom-Json)
}

function Copy-UpdateFile([string]$Source, [string]$Destination) {
    $parent = [IO.Path]::GetDirectoryName($Destination)
    [IO.Directory]::CreateDirectory($parent) | Out-Null
    # Same-directory replacement: an interrupted write never leaves half a file.
    $temporary = Join-Path $parent ('.huanhuan-update-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        [IO.File]::Copy($Source, $temporary, $false)
        if ([IO.File]::Exists($Destination)) {
            [IO.File]::Replace($temporary, $Destination, [NullString]::Value)
        } else {
            [IO.File]::Move($temporary, $Destination)
        }
    } finally {
        if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
    }
}

function Expand-VerifiedUpdate([string]$Archive, [string]$Destination, [string]$ExpectedHash, [long]$ExpectedSize) {
    if ($ExpectedHash -notmatch '^[a-f0-9]{64}$' -or $ExpectedSize -lt 1 -or $ExpectedSize -gt 20MB) {
        throw '更新清单的校验信息无效。'
    }
    if ((Get-Item -LiteralPath $Archive).Length -ne $ExpectedSize -or (Get-UpdateHash $Archive) -ne $ExpectedHash) {
        throw '下载文件未通过校验。原程序没有更改，请稍后重新运行更新。'
    }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        if ($zip.Entries.Count -lt 1 -or $zip.Entries.Count -gt 2000) { throw '更新包文件数量异常。' }
        $seen = @{}
        $total = 0L
        foreach ($entry in $zip.Entries) {
            if (-not $entry.FullName.StartsWith('缓缓/', [StringComparison]::Ordinal)) { throw '更新包目录不正确。' }
            $relative = $entry.FullName.Substring(3)
            Assert-UpdatePath $relative
            if ($seen.ContainsKey($relative)) { throw '更新包存在重复或大小写冲突的文件。' }
            $seen[$relative] = $true
            $kind = ($entry.ExternalAttributes -shr 16) -band 61440
            if ($kind -ne 0 -and $kind -ne 32768) { throw '更新包包含非普通文件。' }
            $total += $entry.Length
            if ($total -gt 80MB -or $entry.Length -gt 15MB) { throw '更新包解压大小异常。' }
        }
        # Complete validation above before extracting even the first entry.
        [IO.Directory]::CreateDirectory($Destination) | Out-Null
        foreach ($entry in $zip.Entries) {
            $path = Get-UpdatePath $Destination $entry.FullName.Substring(3)
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $path, $false)
        }
    } finally { $zip.Dispose() }
    $package = Read-UpdateJson (Join-Path $Destination 'package.json')
    if ($package.name -ne 'huanhuan' -or $package.version -notmatch '^\d+\.\d+\.\d+$') { throw '这不是可识别的缓缓运行包。' }
    foreach ($required in @('打开缓缓.html', 'dist/index.html', 'scripts/update-core.ps1', 'scripts/update-local.ps1', '更新缓缓.bat')) {
        if (-not [IO.File]::Exists((Get-UpdatePath $Destination $required))) { throw '运行包不完整。' }
    }
    return $package.version
}

function Restore-HuanhuanUpdate([string]$Target) {
    $journalPath = Join-Path $Target '.huanhuan-update.json'
    if (-not [IO.File]::Exists($journalPath)) { return $false }
    Assert-UpdateRoot $Target
    $journal = Read-UpdateJson $journalPath
    if ($journal.format -ne 1 -or $journal.target -cne $Target -or $journal.backupName -notmatch '^huanhuan-[a-f0-9]{32}$') {
        throw '恢复记录无法识别。请保留当前文件夹和旁边的程序备份，暂勿手动覆盖。'
    }
    $backup = Get-UpdatePath ([IO.Path]::GetDirectoryName($Target)) $journal.backupName
    Assert-UpdateRoot $backup
    if (@($journal.files).Count -lt 1 -or @($journal.files).Count -gt 2000) { throw '恢复清单无效。' }
    $seen = @{}
    # Validate every backup before touching the target. Missing backups must not cause partial rollback.
    foreach ($entry in $journal.files) {
        Assert-UpdatePath $entry.name
        if ($seen.ContainsKey($entry.name) -or $entry.existed -isnot [bool]) { throw '恢复清单中有无效项目。' }
        $seen[$entry.name] = $true
        $destination = Get-UpdatePath $Target $entry.name
        if (Test-Path -LiteralPath $destination -PathType Container) { throw '恢复路径被文件夹占用。' }
        if ($entry.existed) {
            $source = Get-UpdatePath $backup $entry.name
            if ($entry.hash -notmatch '^[a-f0-9]{64}$' -or (Get-UpdateHash $source) -ne $entry.hash) {
                throw '程序备份不完整，已停止恢复。请保留文件并重新下载运行包。'
            }
        }
    }
    foreach ($entry in $journal.files) {
        $destination = Get-UpdatePath $Target $entry.name
        if ($entry.existed) { Copy-UpdateFile (Get-UpdatePath $backup $entry.name) $destination }
        elseif ([IO.File]::Exists($destination)) { [IO.File]::Delete($destination) }
    }
    [IO.File]::Delete($journalPath)
    return $true
}

function Install-HuanhuanUpdate([string]$Target, [string]$Staging, [scriptblock]$AfterFile = {}) {
    $Target = [IO.Path]::GetFullPath($Target).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    Assert-UpdateRoot $Target
    Assert-UpdateRoot $Staging
    $old = Read-UpdateJson (Get-UpdatePath $Target 'package.json')
    $next = Read-UpdateJson (Get-UpdatePath $Staging 'package.json')
    if ($old.name -ne 'huanhuan' -or $next.name -ne 'huanhuan') { throw '只能更新已有的缓缓文件夹。' }
    if ([version]$next.version -lt [version]$old.version) { throw '下载版本比当前版本旧，已停止更新。' }
    if ([IO.File]::Exists((Join-Path $Target '.huanhuan-update.json'))) { throw '请先恢复上次未完成的更新。' }
    $backupName = 'huanhuan-' + [Guid]::NewGuid().ToString('N')
    $backup = Join-Path ([IO.Path]::GetDirectoryName($Target)) $backupName
    $entries = @()
    foreach ($file in Get-ChildItem -LiteralPath $Staging -Recurse -File -Force) {
        $name = $file.FullName.Substring($Staging.Length + 1).Replace([IO.Path]::DirectorySeparatorChar, '/')
        $source = Get-UpdatePath $Staging $name
        $destination = Get-UpdatePath $Target $name
        if (Test-Path -LiteralPath $destination -PathType Container) { throw '更新文件的位置被已有文件夹占用。原程序未更改。' }
        $existed = [IO.File]::Exists($destination)
        $entries += [PSCustomObject]@{ name = $name; existed = $existed; hash = $(if ($existed) { Get-UpdateHash $destination } else { '' }) }
    }
    if ($entries.Count -lt 1 -or $entries.Count -gt 2000) { throw '更新文件数量异常。' }
    $changed = @($entries | Where-Object { -not $_.existed -or $_.hash -ne (Get-UpdateHash (Get-UpdatePath $Staging $_.name)) })
    if ($changed.Count -eq 0) { return [PSCustomObject]@{ version = $next.version; backup = $null; files = 0; changed = $false } }
    # Back up only program files that will be replaced; unrelated personal files remain untouched.
    [IO.Directory]::CreateDirectory($backup) | Out-Null
    foreach ($entry in $entries) {
        if ($entry.existed) {
            Copy-UpdateFile (Get-UpdatePath $Target $entry.name) (Get-UpdatePath $backup $entry.name)
            if ((Get-UpdateHash (Get-UpdatePath $backup $entry.name)) -ne $entry.hash) { throw '备份校验未通过，原程序没有更改。' }
        }
    }
    $journal = @{ format = 1; target = $Target; backupName = $backupName; files = $entries }
    Write-UpdateJson (Join-Path $backup '恢复清单.json') $journal
    $journalPath = Join-Path $Target '.huanhuan-update.json'
    Write-UpdateJson $journalPath $journal
    try {
        foreach ($entry in $entries) {
            $source = Get-UpdatePath $Staging $entry.name
            $destination = Get-UpdatePath $Target $entry.name
            Copy-UpdateFile $source $destination
            if ((Get-UpdateHash $source) -ne (Get-UpdateHash $destination)) { throw '写入后的程序文件未通过校验。' }
            & $AfterFile $entry.name
        }
        [IO.File]::Delete($journalPath)
    } catch {
        $failure = $_
        try { Restore-HuanhuanUpdate $Target | Out-Null }
        catch { throw "更新未完成（$($failure.Exception.Message)），自动恢复也未完成（$($_.Exception.Message)）。请保留程序备份：$backup。下次运行将再次尝试恢复。" }
        throw "更新未完成，已恢复原程序。原因：$($failure.Exception.Message)"
    }
    return [PSCustomObject]@{ version = $next.version; backup = $backup; files = $entries.Count; changed = $true }
}
