param(
  [Parameter(Mandatory = $true)][string]$SrcDir,
  [Parameter(Mandatory = $true)][string]$DestDir,
  [int]$Size = 1024
)

Add-Type -AssemblyName System.Drawing

$helper = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

public static class IconNorm {
  public static string Run(string src, string dest, int size) {
    using (var srcImg = new Bitmap(src)) {
      int w = srcImg.Width, h = srcImg.Height;
      var rect = new Rectangle(0, 0, w, h);
      var data = srcImg.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      int stride = data.Stride;
      int bytes = Math.Abs(stride) * h;
      byte[] buf = new byte[bytes];
      Marshal.Copy(data.Scan0, buf, 0, bytes);
      srcImg.UnlockBits(data);

      int margin = Math.Max(8, (int)(Math.Min(w, h) * 0.04));
      double bgSum = 0; int bgN = 0;
      Action<int,int> sample = (x, y) => {
        int i = y * stride + x * 4;
        bgSum += 0.2126 * buf[i+2] + 0.7152 * buf[i+1] + 0.0722 * buf[i];
        bgN++;
      };
      for (int y = 0; y < margin; y++) {
        for (int x = 0; x < margin; x++) {
          sample(x, y);
          sample(w - 1 - x, y);
          sample(x, h - 1 - y);
          sample(w - 1 - x, h - 1 - y);
        }
      }
      double bg = bgSum / bgN;
      double thresh = bg + 14;

      int minX = w, minY = h, maxX = 0, maxY = 0, found = 0;
      int ignore = (int)(Math.Min(w, h) * 0.11);
      for (int y = 0; y < h; y++) {
        bool nearY = y < ignore || y >= h - ignore;
        int row = y * stride;
        for (int x = 0; x < w; x++) {
          if (nearY && (x < ignore || x >= w - ignore)) continue;
          int i = row + x * 4;
          double l = 0.2126 * buf[i+2] + 0.7152 * buf[i+1] + 0.0722 * buf[i];
          if (l < thresh) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          found++;
        }
      }
      if (found < 80) {
        minX = (int)(w * 0.12); minY = (int)(h * 0.12);
        maxX = w - minX - 1; maxY = h - minY - 1;
      }

      double cx = (minX + maxX) / 2.0;
      double cy = (minY + maxY) / 2.0;
      int rays = 120;
      double[] rs = new double[rays];
      int rc = 0;
      double maxR = Math.Min(Math.Min(cx, w - 1 - cx), Math.Min(cy, h - 1 - cy));
      for (int a = 0; a < rays; a++) {
        double ang = a * Math.PI * 2.0 / rays;
        double dx = Math.Cos(ang), dy = Math.Sin(ang);
        double hit = 0;
        for (int step = (int)maxR; step >= 0; step--) {
          int x = (int)Math.Round(cx + dx * step);
          int y = (int)Math.Round(cy + dy * step);
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          int i = y * stride + x * 4;
          double l = 0.2126 * buf[i+2] + 0.7152 * buf[i+1] + 0.0722 * buf[i];
          if (l >= thresh) { hit = step; break; }
        }
        if (hit > maxR * 0.25) rs[rc++] = hit;
      }
      Array.Sort(rs, 0, rc);
      double rad = rc > 0 ? rs[rc / 2] : Math.Max(maxX - minX, maxY - minY) / 2.0;
      double pad = rad * 0.04;
      int side = Math.Max(8, (int)Math.Ceiling((rad + pad) * 2));
      int x0 = (int)Math.Round(cx - side / 2.0);
      int y0 = (int)Math.Round(cy - side / 2.0);
      if (x0 < 0) x0 = 0;
      if (y0 < 0) y0 = 0;
      if (x0 + side > w) x0 = Math.Max(0, w - side);
      if (y0 + side > h) y0 = Math.Max(0, h - side);
      if (x0 + side > w) side = w - x0;
      if (y0 + side > h) side = h - y0;

      using (var outBmp = new Bitmap(size, size))
      using (var g = Graphics.FromImage(outBmp)) {
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.SmoothingMode = SmoothingMode.HighQuality;
        g.Clear(Color.FromArgb(10, 10, 12));
        g.DrawImage(srcImg, new Rectangle(0, 0, size, size), new Rectangle(x0, y0, side, side), GraphicsUnit.Pixel);
        string dir = System.IO.Path.GetDirectoryName(dest);
        if (!System.IO.Directory.Exists(dir)) System.IO.Directory.CreateDirectory(dir);
        outBmp.Save(dest, ImageFormat.Png);
      }
      return string.Format("ok found={0} box={1},{2}-{3},{4} side={5} bg={6:n1}", found, minX, minY, maxX, maxY, side, bg);
    }
  }
}
"@

Add-Type -TypeDefinition $helper -ReferencedAssemblies System.Drawing

if (-not (Test-Path -LiteralPath $DestDir)) {
  New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
}

Get-ChildItem -LiteralPath $SrcDir -Filter *.png | ForEach-Object {
  $dest = Join-Path $DestDir $_.Name
  $msg = [IconNorm]::Run($_.FullName, $dest, $Size)
  Write-Output ($_.Name + " " + $msg)
}
