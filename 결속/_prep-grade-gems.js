const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "등급");

function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

async function prep(file) {
  const full = path.join(dir, file);
  const { data, info } = await sharp(full).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const cx = (width - 1) / 2;
  const cy = height * 0.328;
  const gemR = Math.min(width, height) * 0.46;
  const rx = width * 0.27;
  const ry = height * 0.22;

  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const body = inEllipse(x, y, cx, cy, rx * 1.15, ry * 1.1);
      const hole = inEllipse(x, y, cx, cy, rx * 0.72, ry * 0.72);
      if (!body || hole) continue;
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      if (max < 32 || max > 125) continue;
      sr += r;
      sg += g;
      sb += b;
      n++;
    }
  }
  const fill = n
    ? [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)]
    : [40, 56, 80];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const inGem = Math.hypot(x - cx, y - height * 0.37) <= gemR;
      if (!inGem && max < 28) {
        data[i + 3] = 0;
        continue;
      }
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d <= 1) {
        const t = d > 0.82 ? (1 - d) / 0.18 : 1;
        data[i] = Math.round(fill[0] * t + r * (1 - t));
        data[i + 1] = Math.round(fill[1] * t + g * (1 - t));
        data[i + 2] = Math.round(fill[2] * t + b * (1 - t));
        data[i + 3] = 255;
      }
    }
  }

  const tmp = full + ".tmp.png";
  const canvasW = 74;
  const canvasH = 107;
  await sharp(data, { raw: { width, height, channels: 4 } })
    .extend({
      top: Math.floor((canvasH - height) / 2),
      bottom: Math.ceil((canvasH - height) / 2),
      left: Math.floor((canvasW - width) / 2),
      right: Math.ceil((canvasW - width) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(tmp);
  fs.renameSync(tmp, full);
  console.log(file, "fill", fill.join(","), "n", n, width + "x" + height, "->", canvasW + "x" + canvasH);
}

(async () => {
  const src = path.join(dir, "원본");
  for (const f of fs.readdirSync(src).filter((x) => x.endsWith(".png"))) {
    fs.copyFileSync(path.join(src, f), path.join(dir, f));
    await prep(f);
  }
})();
