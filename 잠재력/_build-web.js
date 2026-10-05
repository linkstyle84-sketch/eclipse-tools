const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = __dirname;
const web = path.join(root, "_web");
const resizePs1 = path.join(root, "_resize.ps1");
const srcHtml = path.join(root, "Index-source.html");

function resize(src, dest, width, height, quality, mode) {
  execFileSync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", resizePs1,
    "-Src", src,
    "-Dest", dest,
    "-Width", String(width),
    "-Height", String(height),
    "-Quality", String(quality),
    "-Mode", mode || "Cover"
  ], { windowsHide: true });
}

function dataUri(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  return "data:" + mime + ";base64," + fs.readFileSync(file).toString("base64");
}

const jobs = [
  [path.join(root, "eclipse-header.png"), path.join(web, "eclipse-header.jpg"), 1600, 500, 86, "Fit"],
  [path.join(root, "banner.png"), path.join(web, "banner.jpg"), 1600, 500, 86, "Fit"]
];

const iconNames = ["본능", "직감", "감각", "격앙", "충동", "기세", "적응", "유연", "수용", "변주", "전조", "균형", "판단", "관조", "숙고", "절제", "분별", "직시"];
for (const name of iconNames) {
  jobs.push([
    path.join(root, "근원", name + ".png"),
    path.join(web, "근원", name + ".jpg"),
    256, 256, 86, "Cover"
  ]);
}

for (const [src, dest, w, h, q, mode] of jobs) {
  if (!fs.existsSync(src)) throw new Error("missing source " + src);
  resize(src, dest, w, h, q, mode);
  console.log(path.relative(root, dest), fs.statSync(dest).size);
}

const replacements = {
  "eclipse-header.png": path.join(web, "eclipse-header.jpg"),
  "banner.png": path.join(web, "banner.jpg")
};
for (const name of iconNames) {
  replacements["근원/" + name + ".png"] = path.join(web, "근원", name + ".jpg");
}
const bgNames = ["태초", "변화", "성찰"];
for (const name of bgNames) {
  replacements["바탕/" + name + ".png"] = path.join(root, "바탕", name + ".png");
}

let html = fs.readFileSync(srcHtml, "utf8");
for (const [from, file] of Object.entries(replacements)) {
  if (!html.includes(from)) throw new Error("html missing " + from);
  html = html.split(from).join(dataUri(file));
}

const outIndex = path.join(root, "Index.html");
const outPreview = path.join(root, "미리보기.html");
fs.writeFileSync(outIndex, html);
fs.writeFileSync(outPreview, html);
console.log("Index.html", html.length);
console.log("미리보기.html", html.length);
