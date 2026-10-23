Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../scripts/update-core.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('huanhuan-update-test-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch) | Out-Null
$passed = 0

function Assert-That($Value, [string]$Message) {
    if (-not $Value) { throw "Assertion failed: $Message" }
}
function Must-Fail([scriptblock]$Action, [string]$Contains) {
    $caught = $false
    try { & $Action | Out-Null } catch {
        $caught = $true
        Assert-That ($_.Exception.Message.Contains($Contains)) "Expected '$Contains', got '$($_.Exception.Message)'"
    }
    Assert-That $caught 'Expected failure'
}
function Fixture([string]$Name, [string]$Version = '0.2.0') {
    $folder = Join-Path $scratch $Name
    [IO.Directory]::CreateDirectory((Join-Path $folder 'scripts')) | Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $folder 'dist')) | Out-Null
    [IO.File]::WriteAllText((Join-Path $folder 'package.json'), ('{"name":"huanhuan","version":"' + $Version + '"}'))
    foreach ($path in @('打开缓缓.html', 'dist/index.html', 'scripts/update-core.ps1', 'scripts/update-local.ps1', '更新缓缓.bat')) {
        [IO.File]::WriteAllText((Get-UpdatePath $folder $path), "fixture $Version")
    }
    return $folder
}
function New-Zip([string]$Name, $Entries) {
    $path = Join-Path $scratch ($Name + '.zip')
    $zip = [IO.Compression.ZipFile]::Open($path, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($item in $Entries) {
            $entry = $zip.CreateEntry($item.name)
            if ($item.ContainsKey('attributes')) { $entry.ExternalAttributes = $item.attributes }
            $writer = New-Object IO.StreamWriter($entry.Open())
            try { $writer.Write($item.body) } finally { $writer.Dispose() }
        }
    } finally { $zip.Dispose() }
    return $path
}
function Case([string]$Name, [scriptblock]$Action) {
    & $Action
    $script:passed += 1
    Write-Host "PASS $Name"
}

try {
    Case 'normal update preserves unrelated files, keeps old program backup and original folder' {
        $target = Fixture 'normal target'
        $stage = Fixture 'normal stage' '0.3.0'
        [IO.File]::WriteAllText((Join-Path $target '我的私人备份.json'), 'private fixture')
        [IO.File]::WriteAllText((Join-Path $stage 'new.txt'), 'new fixture')
        $result = Install-HuanhuanUpdate $target $stage
        Assert-That ($result.version -eq '0.3.0') 'new version'
        Assert-That ((Read-UpdateJson (Join-Path $target 'package.json')).version -eq '0.3.0') 'installed'
        Assert-That ((Read-UpdateJson (Join-Path $result.backup 'package.json')).version -eq '0.2.0') 'backup'
        Assert-That ([IO.File]::ReadAllText((Join-Path $target '我的私人备份.json')) -eq 'private fixture') 'private file preserved'
        Assert-That (-not [IO.File]::Exists((Join-Path $target '.huanhuan-update.json'))) 'journal cleared'
    }
    Case 'failure after writes rolls back every old file and removes newly introduced files' {
        $target = Fixture 'rollback-target'
        $stage = Fixture 'rollback-stage' '0.3.0'
        [IO.File]::WriteAllText((Join-Path $stage 'aaa-new.txt'), 'new file')
        $script:writes = 0
        Must-Fail { Install-HuanhuanUpdate $target $stage { $script:writes += 1; if ($script:writes -eq 3) { throw 'simulated disk failure' } } } '已恢复原程序'
        Assert-That ((Read-UpdateJson (Join-Path $target 'package.json')).version -eq '0.2.0') 'old version restored'
        Assert-That ([IO.File]::ReadAllText((Join-Path $target '打开缓缓.html')) -eq 'fixture 0.2.0') 'old HTML restored'
        Assert-That (-not [IO.File]::Exists((Join-Path $target 'aaa-new.txt'))) 'new file removed'
    }
    Case 'repeated identical update leaves files and backup history unchanged' {
        $target = Fixture 'repeat-target' '0.3.0'
        $stage = Fixture 'repeat-stage' '0.3.0'
        $result = Install-HuanhuanUpdate $target $stage
        Assert-That (-not $result.changed) 'no-op'
        Assert-That ($null -eq $result.backup) 'no extra backup'
    }
    Case 'recover unfinished journal, repeat recovery is harmless' {
        $target = Fixture 'recover-target'
        $backupName = 'huanhuan-' + [Guid]::NewGuid().ToString('N')
        $backup = Join-Path $scratch $backupName
        [IO.Directory]::CreateDirectory($backup) | Out-Null
        $old = Join-Path $target '打开缓缓.html'
        Copy-UpdateFile $old (Join-Path $backup '打开缓缓.html')
        Write-UpdateJson (Join-Path $target '.huanhuan-update.json') @{ format = 1; target = $target; backupName = $backupName; files = @(@{ name = '打开缓缓.html'; existed = $true; hash = (Get-UpdateHash $old) }) }
        [IO.File]::WriteAllText($old, 'partially installed new version')
        Assert-That (Restore-HuanhuanUpdate $target) 'recovered'
        Assert-That ([IO.File]::ReadAllText($old) -eq 'fixture 0.2.0') 'old contents'
        Assert-That (-not (Restore-HuanhuanUpdate $target)) 'no further recovery needed'
    }
    Case 'downgrade refused without changing program' {
        $target = Fixture 'downgrade-target' '0.4.0'
        $stage = Fixture 'downgrade-stage' '0.3.0'
        Must-Fail { Install-HuanhuanUpdate $target $stage } '比当前版本旧'
        Assert-That ((Read-UpdateJson (Join-Path $target 'package.json')).version -eq '0.4.0') 'unchanged'
    }
    Case 'file-directory collision refused before journal or writes' {
        $target = Fixture 'collision-target'
        $stage = Fixture 'collision-stage' '0.3.0'
        [IO.Directory]::CreateDirectory((Join-Path $target 'new.txt')) | Out-Null
        [IO.File]::WriteAllText((Join-Path $stage 'new.txt'), 'new')
        Must-Fail { Install-HuanhuanUpdate $target $stage } '被已有文件夹占用'
        Assert-That ((Read-UpdateJson (Join-Path $target 'package.json')).version -eq '0.2.0') 'unchanged'
    }
    Case 'archive integrity mismatch fails before extraction' {
        $zip = New-Zip 'bad-hash' @(@{name='缓缓/package.json';body='{}'})
        $dest = Join-Path $scratch 'bad-hash-output'
        Must-Fail { Expand-VerifiedUpdate $zip $dest ('a' * 64) (Get-Item $zip).Length } '未通过校验'
        Assert-That (-not (Test-Path $dest)) 'no extraction'
    }
    Case 'archive traversal rejected before extraction' {
        $zip = New-Zip 'traversal' @(@{name='缓缓/../outside.txt';body='evil'})
        Must-Fail { Expand-VerifiedUpdate $zip (Join-Path $scratch 'traversal-output') (Get-UpdateHash $zip) (Get-Item $zip).Length } '不安全'
        Assert-That (-not (Test-Path (Join-Path $scratch 'outside.txt'))) 'no escape'
    }
    Case 'archive case-insensitive duplicates rejected' {
        $zip = New-Zip 'duplicates' @(@{name='缓缓/README.md';body='one'}, @{name='缓缓/readme.md';body='two'})
        Must-Fail { Expand-VerifiedUpdate $zip (Join-Path $scratch 'duplicates-output') (Get-UpdateHash $zip) (Get-Item $zip).Length } '大小写冲突'
    }
    Case 'archive symlinks rejected' {
        $zip = New-Zip 'symlink' @(@{name='缓缓/link';body='../outside';attributes=([int]0xA1FF -shl 16)})
        Must-Fail { Expand-VerifiedUpdate $zip (Join-Path $scratch 'link-output') (Get-UpdateHash $zip) (Get-Item $zip).Length } '非普通文件'
    }
    Case 'Windows reserved names, streams and ambiguous paths rejected' {
        foreach ($name in @('CON.txt', 'a/NUL', 'a/file:stream', '/absolute', 'a\b', 'a/../b', 'a./file', 'file ', '.git/config', '.huanhuan-update.json', 'a//b')) {
            Must-Fail { Assert-UpdatePath $name } '文件路径'
        }
    }
    Case 'incomplete package rejected after integrity validation' {
        $zip = New-Zip 'incomplete' @(@{name='缓缓/package.json';body='{"name":"huanhuan","version":"0.3.0"}'})
        Must-Fail { Expand-VerifiedUpdate $zip (Join-Path $scratch 'incomplete-output') (Get-UpdateHash $zip) (Get-Item $zip).Length } '运行包不完整'
    }
    Case 'valid complete ZIP unpacks including Unicode and spaces' {
        $files = @(@{name='缓缓/package.json';body='{"name":"huanhuan","version":"0.3.0"}'})
        foreach ($name in @('打开缓缓.html', 'dist/index.html', 'scripts/update-core.ps1', 'scripts/update-local.ps1', '更新缓缓.bat', '中文 空格.txt')) {
            $files += @{name=('缓缓/' + $name);body='完整包'}
        }
        $zip = New-Zip 'valid' $files
        $dest = Join-Path $scratch 'valid output'
        Assert-That ((Expand-VerifiedUpdate $zip $dest (Get-UpdateHash $zip) (Get-Item $zip).Length) -eq '0.3.0') 'version'
        Assert-That ([IO.File]::ReadAllText((Join-Path $dest '中文 空格.txt')) -eq '完整包') 'Unicode'
    }
    Write-Host "$passed updater checks passed."
} finally {
    Remove-Item -LiteralPath $scratch -Recurse -Force
}
