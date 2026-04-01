Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\build\icon.png"
$dstPath = Join-Path $PSScriptRoot "..\build\icon.ico"

$img = [System.Drawing.Image]::FromFile((Resolve-Path $srcPath).Path)
$sizes = @(16, 32, 48, 64, 128, 256)

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)

# ICO header
$bw.Write([uint16]0)        # reserved
$bw.Write([uint16]1)        # type: icon
$bw.Write([uint16]$sizes.Count)

$offset = 6 + ($sizes.Count * 16)
$imgStreams = @()

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($img, $s, $s)
    $pms = New-Object System.IO.MemoryStream
    $bmp.Save($pms, [System.Drawing.Imaging.ImageFormat]::Png)
    $imgStreams += $pms

    $sz = if ($s -ge 256) { [byte]0 } else { [byte]$s }
    $bw.Write([byte]$sz)          # width
    $bw.Write([byte]$sz)          # height
    $bw.Write([byte]0)            # color count
    $bw.Write([byte]0)            # reserved
    $bw.Write([uint16]1)          # color planes
    $bw.Write([uint16]32)         # bits per pixel
    $bw.Write([uint32]$pms.Length) # image size
    $bw.Write([uint32]$offset)    # offset
    $offset += $pms.Length
    $bmp.Dispose()
}

foreach ($ims in $imgStreams) {
    $bw.Write($ims.ToArray())
    $ims.Dispose()
}

[System.IO.File]::WriteAllBytes($dstPath, $ms.ToArray())
$bw.Dispose()
$ms.Dispose()
$img.Dispose()

Write-Host "icon.ico olusturuldu: $dstPath"
