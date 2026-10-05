const fs = require("fs");
const vm = require("vm");
const sandbox = { window: {}, document: undefined, console };
vm.runInNewContext(fs.readFileSync("data.js", "utf8"), sandbox);
sandbox.BIND_DATA = sandbox.window.BIND_DATA;
vm.runInNewContext(fs.readFileSync("app.js", "utf8"), sandbox);
const app = sandbox.window.BIND_APP;
app.state.relic = "초월";
app.state.slots = 6;
app.state.grades = { 희귀: true, 영웅: false, 전설: false, 신화: false };
app.setEnhanceAll(5);
app.state.excluded = new Set();
let ev = app.optimize();
console.log("6칸 희귀 5강", ev.names.length, ev.pts, ev.lines.filter((l) => l.kind === "페어").length);
console.log(ev.names.join(", "));
console.log(
  ev.lines
    .filter((l) => l.kind === "페어")
    .map((l) => l.grade + " " + l.size + "장 " + l.enhance + "강 " + l.cards.join("/"))
    .join("\n")
);
app.state.slots = 15;
ev = app.optimize();
console.log("\n15칸 희귀 5강", ev.names.length, ev.pts, "페어", ev.lines.filter((l) => l.kind === "페어").length);
app.state.grades.영웅 = true;
ev = app.optimize();
console.log("15칸 희귀+영웅 5강", ev.names.length, ev.pts, "페어", ev.lines.filter((l) => l.kind === "페어").length);
app.setEnhanceAll(1);
app.state.slots = 6;
app.state.excluded = new Set();
app.state.grades = { 희귀: true, 영웅: false, 전설: false, 신화: false };
ev = app.optimize();
console.log("\n6칸 희귀 1강", ev.pts, "페어", ev.lines.filter((l) => l.kind === "페어").map((l) => l.enhance + "강 " + l.size + "장").join(", "));
app.state.relic = "외형";
app.setEnhanceAll(5);
ev = app.optimize();
console.log("외형 6칸 희귀 5강", ev.pts, ev.names.join(", "));
app.state.relic = "초월";
app.state.slots = 10;
ev = app.optimize();
console.log("초월 10칸 희귀", ev.names.length, "빈칸", ev.leftover.length, ev.pts);
app.state.slots = 6;
app.state.grades = { 희귀: true, 영웅: true, 전설: false, 신화: false };
app.state.gradeEnhance = { 희귀: 5, 영웅: 1, 전설: 5, 신화: 5 };
ev = app.optimize();
const pairG = ev.lines.filter((l) => l.kind === "페어").map((l) => l.grade + " " + l.enhance + "강 " + l.size + "장");
console.log("희귀5+영웅1", ev.pts, pairG.join(", "));
