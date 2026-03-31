Add-Type -AssemblyName System.Drawing

$s = 256
$bmp = New-Object System.Drawing.Bitmap($s, $s)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Mavi daire arkaplan
$bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 30, 64, 175))
$g.FillEllipse($bg, 4, 4, 248, 248)

# Beyaz "N" harfi
$font = New-Object System.Drawing.Font("Segoe UI", 110, [System.Drawing.FontStyle]::Bold)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString("N", $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(0, 0, $s, $s), $sf)

$font.Dispose()
$sf.Dispose()
$g.Dispose()
$bg.Dispose()

$outPath = Join-Path $PSScriptRoot "..\build\icon.png"
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "İkon oluşturuldu: $outPath"
