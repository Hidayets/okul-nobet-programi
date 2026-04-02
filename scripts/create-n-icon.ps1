Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Indigo arka plan (#4F46E5)
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(79, 70, 229))
$g.FillRectangle($bgBrush, 0, 0, $size, $size)

# Beyaz "N" harfi
$fontFamily = New-Object System.Drawing.FontFamily("Segoe UI")
$font = New-Object System.Drawing.Font($fontFamily, 320, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

$rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
$g.DrawString("N", $font, $textBrush, $rect, $sf)

# PNG kaydet
$pngPath = Join-Path $PSScriptRoot "..\build\icon.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "icon.png olusturuldu: $pngPath"

# ICO olustur
$icoSizes = @(16, 32, 48, 64, 128, 256)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)

$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$icoSizes.Count)

$offset = 6 + ($icoSizes.Count * 16)
$imgStreams = @()

foreach ($s in $icoSizes) {
    $resized = New-Object System.Drawing.Bitmap($bmp, $s, $s)
    $pms = New-Object System.IO.MemoryStream
    $resized.Save($pms, [System.Drawing.Imaging.ImageFormat]::Png)
    $imgStreams += $pms

    $sz = if ($s -ge 256) { [byte]0 } else { [byte]$s }
    $bw.Write([byte]$sz)
    $bw.Write([byte]$sz)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$pms.Length)
    $bw.Write([uint32]$offset)
    $offset += $pms.Length
    $resized.Dispose()
}

foreach ($ims in $imgStreams) {
    $bw.Write($ims.ToArray())
    $ims.Dispose()
}

$icoPath = Join-Path $PSScriptRoot "..\build\icon.ico"
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
Write-Host "icon.ico olusturuldu: $icoPath"

$bw.Dispose()
$ms.Dispose()
$font.Dispose()
$g.Dispose()
$bmp.Dispose()
