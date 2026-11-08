$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -eq 'Core') {
    & (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath
    if ($LASTEXITCODE -ne 0) { throw "Windows PowerShell 构建失败（$LASTEXITCODE）。" }
    return
}
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$build = Join-Path $PSScriptRoot 'build'
$dist = Join-Path $PSScriptRoot 'dist'
$package = Join-Path $build 'package'
$downloads = Join-Path $repo 'downloads'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
New-Item -ItemType Directory -Path $build, $dist, $package, $downloads -Force | Out-Null
Add-Type -AssemblyName System.Drawing
if (-not ('PetAssetCrop' -as [type])) {
    Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class PetAssetCrop {
    public static void Save(string input, string output) {
        using (Bitmap image = new Bitmap(input)) {
            Rectangle full = new Rectangle(0, 0, image.Width, image.Height);
            BitmapData data = image.LockBits(full, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            int left = image.Width, top = image.Height, right = -1, bottom = -1;
            try {
                byte[] row = new byte[image.Width * 4];
                for (int y = 0; y < image.Height; y++) {
                    Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), row, 0, row.Length);
                    for (int x = 0; x < image.Width; x++) if (row[x * 4 + 3] != 0) {
                        left = Math.Min(left, x); top = Math.Min(top, y);
                        right = Math.Max(right, x); bottom = Math.Max(bottom, y);
                    }
                }
            } finally { image.UnlockBits(data); }
            if (right < left) throw new InvalidOperationException("Empty PNG: " + input);
            using (Bitmap crop = image.Clone(Rectangle.FromLTRB(left, top, right + 1, bottom + 1), PixelFormat.Format32bppArgb))
                crop.Save(output, ImageFormat.Png);
        }
    }
}
'@
}
$ids = 'nailong', 'naiwa', 'baobaolong', 'xiaoqi', 'niulai', 'capybara', 'naicha', 'naidan', 'feidudu'
$exe = Join-Path $dist 'NaijiacunPet.exe'
$arguments = @('/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/codepage:65001',
    "/out:$exe", "/win32manifest:$(Join-Path $PSScriptRoot 'app.manifest')", '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll')
foreach ($id in $ids) {
    $cropped = Join-Path $build "$id.png"
    [PetAssetCrop]::Save((Join-Path $repo "assets\characters\3d\$id-pet.png"), $cropped)
    $arguments += "/resource:$cropped,Pets.$id.png"
}
$arguments += Join-Path $PSScriptRoot 'Pet.cs'
& $compiler $arguments
if ($LASTEXITCODE -ne 0) { throw "C# 编译失败（$LASTEXITCODE）。" }
Copy-Item -LiteralPath $exe -Destination (Join-Path $package 'NaijiacunPet.exe') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '使用说明.txt') -Destination $package -Force
Compress-Archive -LiteralPath (Join-Path $package 'NaijiacunPet.exe'), (Join-Path $package '使用说明.txt') -DestinationPath (Join-Path $downloads 'naijiacun-pet-windows.zip') -Force
& (Join-Path $PSScriptRoot 'verify.ps1')
