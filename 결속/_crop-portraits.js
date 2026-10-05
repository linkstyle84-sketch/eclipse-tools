const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC = path.join(__dirname, "조합", "초월의성물");
const OUT = path.join(__dirname, "초상화");
const TEST = process.argv.includes("--test");

function sample(data, width, channels, x, y) {
  const i = (y * width + x) * channels;
  return [data[i], data[i + 1], data[i + 2]];
}

function brightness(r, g, b) {
  return r + g + b;
}

function meanVar(data, width, channels, x, y, w, h, step) {
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let yy = y; yy < y + h; yy += step) {
    for (let xx = x; xx < x + w; xx += step) {
      const [r, g, b] = sample(data, width, channels, xx, yy);
      const v = brightness(r, g, b);
      sum += v;
      sum2 += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return { mean, variance: sum2 / n - mean * mean, n };
}

function meanChroma(data, width, channels, x, y, w, h, step) {
  let sum = 0;
  let n = 0;
  for (let yy = y; yy < y + h; yy += step) {
    for (let xx = x; xx < x + w; xx += step) {
      const [r, g, b] = sample(data, width, channels, xx, yy);
      sum += Math.max(r, g, b) - Math.min(r, g, b);
      n++;
    }
  }
  return sum / n;
}

function ringBright(data, width, channels, x, y, s) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < s; i += 2) {
    for (const [xx, yy] of [
      [x + 1, y + i],
      [x + s - 2, y + i],
      [x + i, y + 1],
      [x + i, y + s - 2],
    ]) {
      const [r, g, b] = sample(data, width, channels, xx, yy);
      sum += brightness(r, g, b);
      n++;
    }
  }
  return sum / n;
}

function closeXScore(data, width, height, channels, cx, cy, r) {
  if (cx - r < 0 || cy - r < 0 || cx + r >= width || cy + r >= height) return -1;
  let diag = 0;
  let nd = 0;
  let off = 0;
  let no = 0;
  for (let i = -r; i <= r; i++) {
    const a = sample(data, width, channels, cx + i, cy + i);
    const b = sample(data, width, channels, cx + i, cy - i);
    diag += brightness(a[0], a[1], a[2]) + brightness(b[0], b[1], b[2]);
    nd += 2;
    if (Math.abs(i) < 3) continue;
    const h = sample(data, width, channels, cx + i, cy);
    const v = sample(data, width, channels, cx, cy + i);
    off += brightness(h[0], h[1], h[2]) + brightness(v[0], v[1], v[2]);
    no += 2;
  }
  return diag / nd - off / no;
}

function findCloseX(data, width, height, channels) {
  let best = { x: 0, y: 0, score: -1 };
  for (let cy = 132; cy <= 520; cy += 1) {
    for (let cx = 748; cx <= 778; cx += 1) {
      const sc = closeXScore(data, width, height, channels, cx, cy, 7);
      if (sc > best.score) best = { x: cx, y: cy, score: sc };
    }
  }
  if (best.score < 40) return null;
  return best;
}

function scoreBox(data, width, height, channels, x, y, s) {
  if (x < 10 || y < 10 || x + s >= width - 10 || y + s >= height - 10) return 0;
  if (x < 686 || x > 712 || x + s > 790) return 0;
  const chroma = meanChroma(data, width, channels, x + 6, y + 6, s - 12, s - 12, 2);
  if (chroma < 12) return 0;
  const inner = meanVar(data, width, channels, x + 6, y + 6, s - 12, s - 12, 2);
  if (inner.variance < 800) return 0;
  if (inner.mean < 35 || inner.mean > 520) return 0;
  const ring = ringBright(data, width, channels, x, y, s);
  if (ring < 55) return 0;
  const xFit = 1 - Math.abs(x + s / 2 - 734) / 40;
  if (xFit < 0) return 0;
  return (Math.sqrt(inner.variance) + chroma * 1.8) * (0.65 + 0.35 * xFit);
}

function searchBox(data, width, height, channels, x0, x1, y0, y1) {
  let best = { x: 0, y: 0, s: 68, score: -1 };
  for (const s of [66, 68, 70]) {
    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const sc = scoreBox(data, width, height, channels, x, y, s);
        if (sc > best.score) best = { x, y, s, score: sc };
      }
    }
  }
  return best;
}

function stripStats(data, width, channels, x, y, w, h) {
  return {
    ...meanVar(data, width, channels, x, y, w, h, 1),
    chroma: meanChroma(data, width, channels, x, y, w, h, 1),
  };
}

function clampBox(x, y, s, width, height) {
  x = Math.max(688, Math.min(x, 712, width - s - 8));
  y = Math.max(120, Math.min(y, height - s - 8));
  return { x, y, s };
}

async function findBox(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const close = findCloseX(data, width, height, channels);
  if (close && close.score >= 40) {
    const box = clampBox(close.x - 56, close.y + 29, 68, width, height);
    return Object.assign(box, { score: close.score, close });
  }
  const best = searchBox(data, width, height, channels, 692, 708, 140, Math.min(height - 90, 430));
  if (best.score < 18) return null;
  return clampBox(best.x, best.y, 68, width, height);
}

function compact(s) {
  return String(s).replace(/[\s'’·]/g, "");
}

function loadBind() {
  const data = fs.readFileSync(path.join(__dirname, "data.js"), "utf8");
  const json = data.slice(data.indexOf("{"));
  return Function("return " + json.replace(/;\s*$/, ""))();
}

function dist(a, b) {
  const x = compact(a);
  const y = compact(b);
  if (x === y) return 0;
  const n = Math.max(x.length, y.length);
  let d = Math.abs(x.length - y.length);
  const m = Math.min(x.length, y.length);
  for (let i = 0; i < m; i++) if (x[i] !== y[i]) d++;
  return d;
}

function matchName(file, bind) {
  const list = bind.hanjang[file.grade] || [];
  const byIndex = list[Number(file.num) - 1];
  if (byIndex && dist(file.slug, byIndex.name) <= 2) return byIndex.name;
  const key = compact(file.slug);
  const all = [];
  for (const g of bind.grades) for (const c of bind.hanjang[g]) all.push(c.name);
  const exact = all.filter((n) => compact(n) === key);
  if (exact.length === 1) return exact[0];
  if (byIndex) return byIndex.name;
  return null;
}

function namedShot(name) {
  const m = name.match(/^(희귀|영웅|전설|신화)-(\d+)-(.+)\.(png|jpg|jpeg)$/i);
  if (!m) return null;
  return { grade: m[1], num: m[2], slug: m[3], ext: m[4] };
}

async function cropOne(file, dest) {
  const box = await findBox(file);
  if (!box) return null;
  await sharp(file)
    .extract({ left: box.x, top: box.y, width: box.s, height: box.s })
    .resize(96, 96)
    .png()
    .toFile(dest);
  return box;
}

async function debugOne(file) {
  const box = await findBox(file);
  console.log("DEBUG", path.basename(file), box && { x: box.x, y: box.y, s: box.s, score: box.score, close: box.close });
  if (!box) return;
  const dest = path.join(OUT, "debug-" + path.basename(file).replace(/\.(jpg|jpeg|png)$/i, "") + ".png");
  await sharp(file)
    .extract({ left: box.x, top: box.y, width: box.s, height: box.s })
    .resize(96, 96)
    .png()
    .toFile(dest);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (TEST) {
    const files = fs.readdirSync(SRC).filter((n) =>
      /^(희귀-01-의원|희귀-24-|영웅-01-|영웅-18-|영웅-23-|영웅-28-|영웅-38-|영웅-40-|전설-01-|신화-01-)/.test(n)
    );
    console.log("test files", files);
    for (const n of files) await debugOne(path.join(SRC, n));
    return;
  }
  const bind = loadBind();
  const files = fs
    .readdirSync(SRC)
    .map(namedShot)
    .filter(Boolean)
    .sort((a, b) => a.grade.localeCompare(b.grade, "ko") || Number(a.num) - Number(b.num));
  const ok = [];
  const fail = [];
  const unmatched = [];
  const used = new Set();
  for (const f of files) {
    const srcName = `${f.grade}-${f.num}-${f.slug}.${f.ext}`;
    const src = path.join(SRC, srcName);
    const name = matchName(f, bind);
    if (!name) {
      unmatched.push(srcName);
      continue;
    }
    if (used.has(name)) continue;
    const dest = path.join(OUT, compact(name) + ".png");
    try {
      const box = await cropOne(src, dest);
      if (!box) fail.push(srcName);
      else {
        used.add(name);
        ok.push(name);
        console.log("OK", name, "x=" + box.x, "y=" + box.y, "s=" + box.s, box.score.toFixed(2));
      }
    } catch (e) {
      fail.push(srcName + " " + e.message);
    }
  }
  console.log("ok", ok.length, "fail", fail.length, "unmatched", unmatched.length);
  if (fail.length) console.log("FAIL\n" + fail.join("\n"));
  if (unmatched.length) console.log("UNMATCHED\n" + unmatched.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
