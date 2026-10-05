Add-Type -AssemblyName System.Drawing

function Get-GoldScore([System.Drawing.Bitmap]$bmp, [int]$x, [int]$y, [int]$s) {
  if ($x -lt 0 -or $y -lt 0 -or $x + $s -ge $bmp.Width -or $y + $s -ge $bmp.Height) { return 0 }
  $gold = 0
  $n = 0
  for ($i = 0; $i -lt $s; $i += 2) {
    $pts = @(
      $bmp.GetPixel($x + $i, $y),
      $bmp.GetPixel($x + $i, $y + $s - 1),
      $bmp.GetPixel($x, $y + $i),
      $bmp.GetPixel($x + $s - 1, $y + $i)
    )
    foreach ($p in $pts) {
      $n++
      if ($p.R -gt 145 -and $p.G -gt 105 -and $p.B -lt 170 -and $p.R -ge $p.G - 10 -and $p.G -ge $p.B) { $gold++ }
    }
  }
  if ($n -eq 0) { return 0 }
  return [double]$gold / $n
}

function Find-Portrait([System.Drawing.Bitmap]$bmp) {
  $best = $null
  $bestScore = 0.18
  $x0 = [Math]::Max(480, [int]($bmp.Width * 0.52))
  $x1 = [Math]::Min($bmp.Width - 90, [int]($bmp.Width * 0.82))
  $y0 = 50
  $y1 = [Math]::Min($bmp.Height - 90, 420)
  foreach ($s in @(70, 74, 78, 82)) {
    for ($y = $y0; $y -le $y1; $y += 3) {
      for ($x = $x0; $x -le $x1; $x += 3) {
        $sc = Get-GoldScore $bmp $x $y $s
        if ($sc -gt $bestScore) {
          $bestScore = $sc
          $best = @{ x = $x; y = $y; s = $s; score = $sc }
        }
      }
    }
  }
  return $best
}

$tests = @(
  "c:\Users\links\Downloads\이클립스 툴\결속\조합\초월의성물\희귀-01-의원오데트.png",
  "c:\Users\links\Downloads\이클립스 툴\결속\조합\초월의성물\희귀-24-황혼의검.jpg",
  "c:\Users\links\Downloads\이클립스 툴\결속\조합\초월의성물\영웅-01-설산의파수꾼로레나.jpg",
  "c:\Users\links\Downloads\이클립스 툴\결속\조합\초월의성물\영웅-13-영웅왕의흑검.jpg"
)
$outDir = "c:\Users\links\Downloads\이클립스 툴\결속\_crop-test"
foreach ($f in $tests) {
  if (-not (Test-Path $f)) { Write-Output "MISSING $f"; continue }
  $img = [System.Drawing.Bitmap]::FromFile($f)
  $hit = Find-Portrait $img
  $leaf = [IO.Path]::GetFileNameWithoutExtension($f)
  if ($null -eq $hit) {
    Write-Output "FAIL $leaf"
    $img.Dispose()
    continue
  }
  Write-Output ("HIT {0} x={1} y={2} s={3} sc={4:n2}" -f $leaf, $hit.x, $hit.y, $hit.s, $hit.score)
  $bmp = New-Object System.Drawing.Bitmap $hit.s, $hit.s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0,0,$hit.s,$hit.s), (New-Object System.Drawing.Rectangle $hit.x,$hit.y,$hit.s,$hit.s), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $bmp.Save((Join-Path $outDir ("hit-{0}.png" -f $leaf)), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $img.Dispose()
}
