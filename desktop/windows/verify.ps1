$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'dist\NaijiacunPet.exe'
$zip = Join-Path $PSScriptRoot '..\..\downloads\naijiacun-pet-windows.zip'
if (-not (Test-Path -LiteralPath $exe)) { throw '未找到桌宠 EXE，请先运行 build.ps1。' }

$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = $exe
$start.Arguments = '/self-test'
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$process = [System.Diagnostics.Process]::Start($start)
$report = $process.StandardOutput.ReadToEnd()
$errors = $process.StandardError.ReadToEnd()
$process.WaitForExit()
if ($process.ExitCode -ne 0 -or $report -notmatch 'SELF-TEST PASS') {
    throw "桌宠自检失败：$report $errors"
}
$process.Dispose()

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($zip))
try {
    $names = @($archive.Entries | ForEach-Object FullName)
    if ($names.Count -ne 2 -or $names -notcontains 'NaijiacunPet.exe' -or $names -notcontains '使用说明.txt') {
        throw "下载包内容不符：$($names -join ', ')"
    }
    $entry = $archive.GetEntry('NaijiacunPet.exe')
    $stream = $entry.Open()
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $packedHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '')
    } finally { $sha.Dispose(); $stream.Dispose() }
    if ($packedHash -ne (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash) {
        throw '下载包中的 EXE 与构建产物不一致。'
    }
} finally { $archive.Dispose() }

$report.Trim()
foreach ($path in $exe, $zip) {
    $file = Get-Item -LiteralPath $path
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    "$($file.Name): $($file.Length) bytes; SHA256=$hash"
}
