/* 결속 초기 모델 — 슬롯 수 + 등급 + 강 시나리오 + 없는 카드 제외 */
(function () {
  const BIND_DATA = window.BIND_DATA;
  const RANK = { 희귀: 1, 영웅: 2, 전설: 3, 신화: 4 };
  const RANK_NAME = ["", "희귀", "영웅", "전설", "신화"];

  const RELIC_ORDER = ["초월", "외형", "황금", "경험"];
  const RELIC_LEVELS = [1, 3, 5, 7, 9, 11, 13, 15, 16, 17, 18, 19, 20, 21];
  const SLOT_DEFS = [
    { unlock: 1, min: 1, need: "희귀 이상" },
    { unlock: 1, min: 1, need: "희귀 이상" },
    { unlock: 3, min: 1, need: "희귀 이상" },
    { unlock: 5, min: 1, need: "희귀 이상" },
    { unlock: 7, min: 1, need: "희귀 이상" },
    { unlock: 9, min: 1, need: "희귀 이상" },
    { unlock: 11, min: 1, need: "희귀 이상" },
    { unlock: 13, min: 1, need: "희귀 이상" },
    { unlock: 15, min: 2, need: "영웅 이상" },
    { unlock: 16, min: 2, need: "영웅 이상" },
    { unlock: 17, min: 2, need: "영웅 이상" },
    { unlock: 18, min: 2, need: "영웅 이상" },
    { unlock: 19, min: 2, need: "영웅 이상" },
    { unlock: 20, min: 2, need: "영웅 이상" },
    { unlock: 21, min: 3, need: "전설 이상" },
  ];
  const LOCK_SVG =
    '<svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10V7.8a4 4 0 0 1 8 0V10" fill="none" stroke="#c5c8cc" stroke-width="1.8"/><rect x="6" y="10" width="12" height="10" rx="2" fill="#9aa0a6"/><circle cx="12" cy="15.2" r="1.35" fill="#3a3d40"/></svg>';

  const state = {
    relic: "초월",
    level: 1,
    slots: 2,
    relicLevels: { 초월: 1, 외형: 1, 황금: 1, 경험: 1 },
    grades: { 희귀: false, 영웅: false, 전설: false, 신화: false },
    enhance: 0,
    gradeEnhance: { 희귀: 0, 영웅: 0, 전설: 0, 신화: 0 },
    mode: "PVE",
    excluded: new Set(),
    saved: [null, null],
    relicDecks: { 초월: null, 외형: null, 황금: null, 경험: null },
    relicEnabled: { 초월: true, 외형: false, 황금: false, 경험: false },
    pinned: { 초월: SLOT_DEFS.map(() => null), 외형: SLOT_DEFS.map(() => null), 황금: SLOT_DEFS.map(() => null), 경험: SLOT_DEFS.map(() => null) },
  };

  let lastCapture = null;
  let choiceName = null;
  let choiceSlot = null;
  let bookGrade = "희귀";
  let gradeFxOpen = false;
  let savedScrollY = null;
  let quietDrawTimer = null;
  let ownGrade = null;
  let ownDirty = false;
  const STORAGE_KEY = "eclipse-bind-prefs-v1";
  let saveTimer = null;

  const ENH_OPTS = [0, 1, 3, 5];

  const TIER_W = [0, 100000, 20000, 4000, 800, 160, 32, 6];

  function effectStatName(text) {
    const m = String(text).match(/^(.*?)(?:\s+([\d.]+)(%|초)?)$/);
    return m ? m[1].trim() : String(text).trim();
  }

  function tierOfStat(stat, relic, mode) {
    const list = (BIND_DATA.tiers[relic || state.relic] || {})[mode || state.mode] || [];
    const hit = list.find((x) => x.stat === stat);
    return hit ? hit.tier : 0;
  }

  const FOCUS = {
    초월: { hits: ["일반 공격 피해 감소 무시", "스킬 피해 감소 무시"], extras: [] },
    외형: { hits: ["일반 공격 피해 감소", "스킬 피해 감소"], extras: [] },
    황금: { hits: ["일반 공격 명중", "스킬 명중"], extras: [] },
    경험: { hits: ["일반 공격 회피", "스킬 회피"], extras: ["경험치 획득량 증가"] },
  };

  // 전투 핵심(피해감소·무시·공격/방어)보다 수치와 무관하게 항상 후순위인 스탯
  const LOW_BAND = {
    초월: new Set(["공격 속도", "글로벌 쿨타임 감소", "물약 최대 소지량"]),
    외형: new Set(["시전 속도", "물약 회복률", "글로벌 쿨타임 감소"]),
  };

  function focusOf(relic) {
    return FOCUS[relic] || null;
  }

  function amountWeight(parsed, relic) {
    const v = Number(parsed.value) || 1;
    if (parsed.unit === "%") {
      // 골드·경험치 %는 상위 전투 스탯을 역전하지 않도록 약하게
      if (relic === "황금" && parsed.name === "골드 획득량 증가") return v * 10;
      if (relic === "경험" && parsed.name === "경험치 획득량 증가") return v * 10;
      return v * 100;
    }
    if (parsed.unit === "초") return v * 1000;
    return v;
  }

  function isLowBandStat(relic, name) {
    const set = LOW_BAND[relic];
    return !!(set && set.has(name));
  }

  // 피해감소/무시 1 > 공격·방어 6 이 되도록 2순위 전투 스탯 가중치 조정
  function tierLineWeight(relic, name, tier) {
    let w = TIER_W[tier] || 0;
    if (!w) return 0;
    if (relic === "외형" && (name === "PvE 공격력" || name === "PvP 공격력")) {
      // tier3*6 < TIER_W[2](스킬 피해 감소), tier4는 그보다 낮게
      return tier <= 3 ? 3000 : 2500;
    }
    if (relic === "황금" && name === "골드 획득량 증가") {
      // PvE 피해감소(4000) 아래, PvP 피해감소(160) 위
      return 600;
    }
    if (relic === "경험" && name === "경험치 획득량 증가") {
      // 회피(2티어) 아래, 피해 감소 무시(4·5티어) 위 — PVE 3순위용
      return 2500;
    }
    return w;
  }

  function focusHitCoverage(pts, relic) {
    const spec = focusOf(relic);
    if (!spec) return 0;
    const tracks = BIND_DATA.effects[relic] || {};
    let n = 0;
    for (const g of selectedGrades()) {
      const got = {};
      for (const e of tracks[g] || []) {
        if (pts[g] < e.at) continue;
        got[parseEffectNum(e.text).name] = true;
      }
      if (spec.hits.every((name) => got[name])) n++;
    }
    return n;
  }

  function focusExtraCoverage(pts, relic) {
    const spec = focusOf(relic);
    if (!spec || !spec.extras.length) return 0;
    const tracks = BIND_DATA.effects[relic] || {};
    let n = 0;
    for (const g of selectedGrades()) {
      const got = {};
      for (const e of tracks[g] || []) {
        if (pts[g] < e.at) continue;
        got[parseEffectNum(e.text).name] = true;
      }
      if (spec.extras.some((name) => got[name])) n++;
    }
    return n;
  }

  function focusOwnTrackBonus(names, cards) {
    if (!names || !cards) return 0;
    const have = emptyPts();
    for (const n of names) {
      const c = cards.get(n);
      if (c) have[c.grade]++;
    }
    let v = 0;
    for (const g of selectedGrades()) {
      if (!have[g]) continue;
      v += TIER_W[1] * 15;
      const ownPts = have[g] * (5 + enhanceOf(g));
      if (ownPts >= 10) v += TIER_W[1] * 15;
      if (g !== "희귀" && ownPts >= 15) v += TIER_W[1] * 12;
    }
    return v;
  }

  function effectValue(pts, relic, names, cards) {
    let core = 0;
    let util = 0;
    relic = relic || state.relic;
    const tracks = BIND_DATA.effects[relic] || {};
    const spec = focusOf(relic);
    // 등급별 줄을 합산한 뒤 점수화 — 화면의 결속 효과 총합과 같은 기준
    const totals = new Map();
    for (const g of selectedGrades()) {
      for (const e of tracks[g] || []) {
        if (pts[g] < e.at) continue;
        const parsed = parseEffectNum(e.text);
        const cur = totals.get(parsed.name) || { name: parsed.name, value: 0, unit: parsed.unit || "" };
        cur.value += Number(parsed.value) || 0;
        if (parsed.unit) cur.unit = parsed.unit;
        totals.set(parsed.name, cur);
      }
    }
    for (const parsed of totals.values()) {
      const t = tierOfStat(parsed.name, relic);
      const w = tierLineWeight(relic, parsed.name, t);
      if (!w) continue;
      const line = spec ? w * amountWeight(parsed, relic) : w;
      if (spec && isLowBandStat(relic, parsed.name)) util += line;
      else core += line;
    }
    if (spec) {
      // 1·2티어가 한 번이라도 켜지면 약한 보너스만 (등급 수만큼 중복 가산하지 않음)
      if (spec.hits.every((name) => ((totals.get(name) || {}).value || 0) > 0)) core += TIER_W[1] * 2;
      if (spec.extras.some((name) => ((totals.get(name) || {}).value || 0) > 0)) core += TIER_W[1] * 0.5;
    }
    // util은 전투 핵심(core)보다 항상 아래 밴드
    return (core * 1000000 + util) * 1000 + sumSelected(pts);
  }

  function enhanceOf(grade) {
    if (state.gradeEnhance && state.gradeEnhance[grade] != null) return Number(state.gradeEnhance[grade]) || 0;
    return Number(state.enhance) || 0;
  }

  function setEnhanceAll(n) {
    n = Number(n) || 0;
    state.enhance = n;
    if (!state.gradeEnhance) state.gradeEnhance = {};
    for (const g of BIND_DATA.grades) state.gradeEnhance[g] = n;
  }

  function selectedGrades() {
    return BIND_DATA.grades.filter((g) => state.grades[g]);
  }

  function slotsFromLevel(lv) {
    return SLOT_DEFS.filter((s) => s.unlock <= lv).length;
  }

  function levelOf(relic) {
    relic = relic || state.relic;
    const n = Number(state.relicLevels[relic]);
    return RELIC_LEVELS.includes(n) ? n : 1;
  }

  function slotsOf(relic) {
    return slotsFromLevel(levelOf(relic));
  }

  function syncCurrentLevel() {
    state.level = levelOf(state.relic);
    state.slots = slotsOf(state.relic);
  }

  function setRelicLevel(n, relic) {
    relic = relic || state.relic;
    n = Number(n);
    if (!RELIC_LEVELS.includes(n)) {
      n = RELIC_LEVELS.reduce((best, lv) => (Math.abs(lv - n) < Math.abs(best - n) ? lv : best), 1);
    }
    if (!state.relicLevels) state.relicLevels = { 초월: 1, 외형: 1, 황금: 1, 경험: 1 };
    state.relicLevels[relic] = n;
    if (relic === state.relic) {
      state.level = n;
      state.slots = slotsFromLevel(n);
    }
  }

  function stepRelicLevel(dir) {
    const i = RELIC_LEVELS.indexOf(levelOf(state.relic));
    const next = RELIC_LEVELS[i + dir];
    if (next == null) return;
    setRelicLevel(next, state.relic);
  }

  function slotMins(n) {
    const a = [];
    for (let i = 1; i <= n; i++) a.push(i <= 8 ? 1 : i <= 14 ? 2 : 3);
    return a;
  }

  function slotBreakdown(n) {
    const rare = Math.min(n, 8);
    const hero = n <= 8 ? 0 : Math.min(n - 8, 6);
    const legend = n >= 15 ? 1 : 0;
    return { rare, hero, legend };
  }

  function assignSlots(names, cards, relic) {
    relic = relic || state.relic;
    const level = levelOf(relic);
    const slots = SLOT_DEFS.map((d) => ({ ...d, card: null }));
    const taken = new Array(slots.length).fill(false);
    const placed = new Set();
    const pins = state.pinned[relic] || [];
    for (let i = 0; i < slots.length; i++) {
      const n = pins[i];
      if (!n || slots[i].unlock > level) continue;
      const c = cards.get(n);
      if (!c || c.rank < slots[i].min) continue;
      slots[i].card = c;
      taken[i] = true;
      placed.add(n);
    }
    const used = names.map((n) => cards.get(n)).filter((c) => c && !placed.has(c.name)).sort((a, b) => a.rank - b.rank);
    for (const c of used) {
      let pick = -1;
      for (let i = 0; i < slots.length; i++) {
        if (taken[i] || slots[i].unlock > level || c.rank < slots[i].min) continue;
        if (pick < 0 || slots[i].min > slots[pick].min) pick = i;
      }
      if (pick >= 0) {
        taken[pick] = true;
        slots[pick].card = c;
      }
    }
    return slots;
  }

  function pinnedNames(relic) {
    relic = relic || state.relic;
    const level = levelOf(relic);
    const cards = cardIndex();
    const out = [];
    const seen = new Set();
    (state.pinned[relic] || []).forEach((n, i) => {
      if (!n || seen.has(n)) return;
      const c = cards.get(n);
      if (!c || SLOT_DEFS[i].unlock > level || c.rank < SLOT_DEFS[i].min) return;
      seen.add(n);
      out.push(n);
    });
    return out;
  }

  function comboPts(grade, isPair) {
    if (grade === "희귀") return isPair ? { 희귀: 3 } : { 희귀: 5 };
    if (grade === "영웅") return { 희귀: 3, 영웅: 5 };
    if (grade === "전설") return { 영웅: 3, 전설: 5 };
    return { 전설: 3, 신화: 5 };
  }

  function addPts(dst, src) {
    for (const k of BIND_DATA.grades) dst[k] += src[k] || 0;
  }

  function emptyPts() {
    return { 희귀: 0, 영웅: 0, 전설: 0, 신화: 0 };
  }

  function sumSelected(pts) {
    return selectedGrades().reduce((s, g) => s + pts[g], 0);
  }

  let cardIndexCache = null;
  let dirtyStart = 0;
  const lastEvByRelic = { 초월: null, 외형: null, 황금: null, 경험: null };
  const BITMASK_PAIR_LIMIT = 12;
  const FOCUS_DIST_LIMIT = 72;

  function cardIndex() {
    if (cardIndexCache) return cardIndexCache;
    const map = new Map();
    for (const g of BIND_DATA.grades) {
      for (const c of BIND_DATA.hanjang[g]) {
        map.set(c.name, { ...c, rank: RANK[c.grade] });
      }
    }
    cardIndexCache = map;
    return map;
  }

  function markDirtyFrom(relic) {
    if (relic == null) {
      dirtyStart = 0;
      return;
    }
    const i = RELIC_ORDER.indexOf(relic);
    dirtyStart = i < 0 ? 0 : Math.min(dirtyStart, i);
  }

  function relicUsingCard(name) {
    for (const r of RELIC_ORDER) {
      if (!state.relicEnabled[r]) continue;
      const snap = state.relicDecks[r];
      if (snap && snap.names && snap.names.includes(name)) return r;
      const pins = state.pinned[r] || [];
      if (pins.includes(name)) return r;
    }
    return state.relic;
  }

  function combCount(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  }

  function forEachGradeDist(n, gs, fn) {
    if (!n || !gs.length) return;
    if (gs.length === 1) {
      const one = {};
      one[gs[0]] = n;
      fn(one);
      return;
    }
    const total = combCount(n + gs.length - 1, gs.length - 1);
    if (total <= FOCUS_DIST_LIMIT) {
      const acc = {};
      const rec = (i, left) => {
        if (i === gs.length - 1) {
          acc[gs[i]] = left;
          fn(Object.assign({}, acc));
          return;
        }
        for (let k = 0; k <= left; k++) {
          acc[gs[i]] = k;
          rec(i + 1, left - k);
        }
      };
      rec(0, n);
      return;
    }
    const seen = new Set();
    const push = (counts) => {
      const key = gs.map((g) => counts[g] || 0).join(",");
      if (seen.has(key)) return;
      seen.add(key);
      fn(counts);
    };
    const equal = {};
    let left = n;
    for (let i = 0; i < gs.length; i++) {
      const take = i === gs.length - 1 ? left : Math.floor(left / (gs.length - i));
      equal[gs[i]] = take;
      left -= take;
    }
    push(equal);
    for (let prefer = 0; prefer < gs.length; prefer++) {
      const acc = {};
      left = n;
      for (let i = 0; i < gs.length; i++) {
        const g = gs[(prefer + i) % gs.length];
        const need = Math.ceil(10 / (5 + enhanceOf(g)));
        const take = i === gs.length - 1 ? left : Math.min(left, need);
        acc[g] = take;
        left -= take;
      }
      push(acc);
    }
    for (const g of gs) {
      const acc = {};
      for (const x of gs) acc[x] = 0;
      acc[g] = n;
      push(acc);
    }
  }

  function canAssign(names, mins, cards) {
    const have = [0, 0, 0, 0, 0];
    for (const n of names) have[cards.get(n).rank]++;
    const cap = [0, 0, 0, 0];
    for (const m of mins) cap[m]++;
    if (have[1] > cap[1]) return false;
    if (have[1] + have[2] > cap[1] + cap[2]) return false;
    if (have[1] + have[2] + have[3] + have[4] > cap[1] + cap[2] + cap[3]) return false;
    return true;
  }

  function leftoverMins(names, mins, cards) {
    const used = names.map((n) => cards.get(n).rank).sort((a, b) => a - b);
    const slots = mins.slice().sort((a, b) => a - b);
    const taken = new Array(slots.length).fill(false);
    for (const r of used) {
      let pick = -1;
      for (let i = 0; i < slots.length; i++) {
        if (!taken[i] && r >= slots[i]) {
          if (pick < 0 || slots[i] > slots[pick]) pick = i;
        }
      }
      if (pick >= 0) taken[pick] = true;
    }
    return slots.filter((_, i) => !taken[i]);
  }

  function hanjangValue(card) {
    const pts = emptyPts();
    addPts(pts, comboPts(card.grade, false));
    pts[card.grade] += enhanceOf(card.grade);
    return sumSelected(pts);
  }

  function evaluate(names, cards, pairs, hanjangByName, mins) {
    const set = new Set(names);
    const pts = emptyPts();
    const lines = [];
    for (const n of names) {
      const c = cards.get(n);
      pts[c.grade] += enhanceOf(c.grade);
      if (hanjangByName.has(n)) {
        addPts(pts, comboPts(c.grade, false));
        lines.push({ kind: "한장", size: 1, enhance: 0, grade: c.grade, cards: [n], pts: comboPts(c.grade, false) });
      }
    }
    for (const p of pairs) {
      if (enhanceOf(p.grade) < p.enhance) continue;
      if (p.cards.every((n) => set.has(n))) {
        addPts(pts, comboPts(p.grade, true));
        lines.push({
          kind: "페어",
          size: p.size,
          enhance: p.enhance,
          grade: p.grade,
          cards: p.cards.slice(),
          pts: comboPts(p.grade, true),
        });
      }
    }
    return { names: names.slice(), pts, lines, leftover: leftoverMins(names, mins, cards) };
  }

  function pickGradeCounts(baseNames, leftoverMins, counts, allowed, blocked) {
    const used = new Set(baseNames);
    const names = baseNames.slice();
    const need = Object.assign({}, counts);
    const byGrade = {};
    for (const g of BIND_DATA.grades) byGrade[g] = [];
    for (const c of allowed) {
      if (used.has(c.name) || blocked.has(c.name)) continue;
      byGrade[c.grade].push(c);
    }
    const slots = leftoverMins.slice().sort((a, b) => b - a);
    const highFirst = BIND_DATA.grades.slice().reverse();
    for (const min of slots) {
      let pick = null;
      let gPick = null;
      for (const g of highFirst) {
        if (!need[g]) continue;
        if (RANK[g] < min) continue;
        if (!byGrade[g].length) continue;
        pick = byGrade[g].shift();
        gPick = g;
        break;
      }
      if (!pick) return null;
      need[gPick]--;
      names.push(pick.name);
      used.add(pick.name);
    }
    return names;
  }

  function fillHanjang(baseNames, mins, cards, allowed, blocked) {
    const leftover = leftoverMins(baseNames, mins, cards);
    leftover.sort((a, b) => b - a);
    const used = new Set(baseNames);
    const added = [];
    const pool = allowed
      .filter((c) => !used.has(c.name) && !blocked.has(c.name))
      .slice()
      .sort((a, b) => hanjangValue(b) - hanjangValue(a) || a.name.localeCompare(b.name, "ko"));
    for (const min of leftover) {
      const i = pool.findIndex((c) => c.rank >= min);
      if (i < 0) continue;
      const c = pool.splice(i, 1)[0];
      added.push(c.name);
      used.add(c.name);
    }
    return baseNames.concat(added);
  }

  function usedByRelicsBefore(relic) {
    const names = new Set();
    for (const r of RELIC_ORDER) {
      if (r === relic) break;
      if (!state.relicEnabled[r]) continue;
      const snap = state.relicDecks[r];
      if (!snap || !snap.names) continue;
      for (const n of snap.names) names.add(n);
    }
    return names;
  }

  function blockedNames(relic) {
    const blocked = new Set(state.excluded);
    for (const n of usedByRelicsBefore(relic)) blocked.add(n);
    return blocked;
  }

  function takenRelicOf(name) {
    for (const r of RELIC_ORDER) {
      if (r === state.relic) break;
      if (!state.relicEnabled[r]) continue;
      const snap = state.relicDecks[r];
      if (snap && snap.names && snap.names.includes(name)) return r;
    }
    return null;
  }

  function optimize(relic) {
    relic = relic || state.relic;
    const blocked = blockedNames(relic);
    const cards = cardIndex();
    const mins = slotMins(slotsOf(relic));
    const want = new Set(selectedGrades());
    if (!want.size) return null;
    const locked = pinnedNames(relic);
    const allowed = [];
    for (const g of BIND_DATA.grades) {
      if (!want.has(g)) continue;
      for (const c of BIND_DATA.hanjang[g]) {
        if (blocked.has(c.name) && !locked.includes(c.name)) continue;
        allowed.push({ ...c, rank: RANK[c.grade] });
      }
    }
    for (const n of locked) {
      if (allowed.some((c) => c.name === n)) continue;
      const c = cards.get(n);
      if (c) allowed.push(c);
    }
    const hanjangByName = new Map(allowed.map((c) => [c.name, c]));
    const pairs = [];
    for (const g of BIND_DATA.grades) {
      if (!want.has(g)) continue;
      for (const p of (BIND_DATA.relics[relic] || { pairs: {} }).pairs[g] || []) {
        if (enhanceOf(g) < p.enhance) continue;
        if (p.cards.some((n) => blocked.has(n) || !hanjangByName.has(n))) continue;
        pairs.push(p);
      }
    }

    const scoreOf = (names) => {
      const seeded = [...new Set(locked.concat(names))];
      if (!canAssign(seeded, mins, cards)) return null;
      const filled = fillHanjang(seeded, mins, cards, allowed, blocked);
      if (!canAssign(filled, mins, cards)) return null;
      const ev = evaluate(filled, cards, pairs, hanjangByName, mins);
      ev.score = effectValue(ev.pts, relic, ev.names, cards);
      return ev;
    };

    let best = scoreOf([]);
    const trySet = (arr) => {
      const ev = scoreOf(arr);
      if (ev && (!best || ev.score > best.score)) best = ev;
    };

    if (pairs.length <= BITMASK_PAIR_LIMIT) {
      const n = pairs.length;
      const limit = 1 << n;
      for (let mask = 1; mask < limit; mask++) {
        const set = new Set();
        for (let i = 0; i < n; i++) if (mask & (1 << i)) for (const c of pairs[i].cards) set.add(c);
        trySet([...set]);
      }
    } else {
      const density = (p) => {
        const pts = comboPts(p.grade, true);
        return selectedGrades().reduce((s, g) => s + (pts[g] || 0), 0) / p.cards.length;
      };
      const ordered = pairs.slice().sort((a, b) => density(b) - density(a));
      const seedPairs = ordered.slice(0, 24);
      const seeds = [[]].concat(seedPairs.map((p) => p.cards.slice()));
      for (const seed of seeds) {
        let cur = [...new Set(seed)];
        if (!canAssign(cur, mins, cards)) continue;
        let improved = true;
        while (improved) {
          improved = false;
          let local = scoreOf(cur);
          for (const p of ordered) {
            const next = [...new Set(cur.concat(p.cards))];
            const ev = scoreOf(next);
            if (ev && local && ev.score > local.score) {
              cur = next;
              local = ev;
              improved = true;
            }
          }
        }
        trySet(cur);
      }
    }

    if (focusOf(relic)) {
      const leftover = leftoverMins(locked, mins, cards);
      const n = leftover.length;
      const gs = selectedGrades();
      if (n && gs.length) {
        forEachGradeDist(n, gs, (acc) => {
          const names = pickGradeCounts(locked, leftover, acc, allowed, blocked);
          if (names) trySet(names);
        });
      }
    }
    return best;
  }

  function effectLines(relic, pts) {
    const out = {};
    for (const g of BIND_DATA.grades) {
      out[g] = (BIND_DATA.effects[relic][g] || []).filter((e) => pts[g] >= e.at);
    }
    return out;
  }

  function captureFrom(ev, relic) {
    const grouped = groupRecommended(ev);
    relic = relic || state.relic;
    return {
      relic,
      level: levelOf(relic),
      slots: slotsOf(relic),
      mode: state.mode,
      grades: Object.assign({}, state.grades),
      gradeEnhance: Object.assign({}, state.gradeEnhance),
      pts: Object.assign({}, ev.pts),
      names: ev.names.slice(),
      unused: ev.leftover.length,
      n3: grouped.pairLines.filter((l) => l.size === 3).length,
      n2: grouped.pairLines.filter((l) => l.size === 2).length,
      n1: grouped.singles.length,
      pairs: ev.lines
        .filter((l) => l.kind === "페어")
        .map((l) => ({ grade: l.grade, size: l.size, enhance: l.enhance, cards: l.cards.slice() })),
    };
  }

  function snapLabel(snap) {
    if (!snap) return "<small>비어 있음</small>";
    const ge = BIND_DATA.grades
      .filter((g) => snap.grades[g])
      .map((g) => g + " " + (snap.gradeEnhance[g] || 0) + "강")
      .join(" · ");
    return `${escapeHtml(snap.relic)} · Lv.${snap.level || snap.slots} · ${snap.mode}<small>${escapeHtml(ge || "등급 없음")}</small>`;
  }

  function renderSaveBar() {
    const a = el("set-a");
    const b = el("set-b");
    if (!a || !b) return;
    a.classList.toggle("on", !!state.saved[0]);
    b.classList.toggle("on", !!state.saved[1]);
    a.setAttribute("aria-pressed", state.saved[0] ? "true" : "false");
    b.setAttribute("aria-pressed", state.saved[1] ? "true" : "false");
    a.title = state.saved[0]
      ? "다시 누르면 A SET을 지웁니다"
      : "지금 추천을 A SET으로 저장";
    b.title = state.saved[1]
      ? "다시 누르면 B SET을 지웁니다"
      : "지금 추천을 B SET으로 저장";
  }

  function tapSetBtn(btn) {
    if (!btn) return;
    btn.classList.add("tap");
    setTimeout(() => btn.classList.remove("tap"), 180);
  }

  function cloneCapture(snap) {
    return JSON.parse(JSON.stringify(snap));
  }

  function emptyCapture() {
    const pts = {};
    for (const g of BIND_DATA.grades) pts[g] = 0;
    const relics = {};
    for (const r of RELIC_ORDER) relics[r] = null;
    return {
      relic: state.relic,
      level: state.level,
      slots: state.slots,
      mode: state.mode,
      grades: Object.assign({}, state.grades),
      gradeEnhance: Object.assign({}, state.gradeEnhance),
      pts,
      names: [],
      unused: 0,
      n3: 0,
      n2: 0,
      n1: 0,
      pairs: [],
      relics,
    };
  }

  function snapshotNow() {
    const relics = {};
    if (state.slots && selectedGrades().length) {
      markDirtyFrom(null);
      refreshRelicDecks();
      for (const r of RELIC_ORDER) {
        relics[r] = state.relicDecks[r] ? cloneCapture(state.relicDecks[r]) : null;
      }
    } else {
      for (const r of RELIC_ORDER) relics[r] = null;
    }
    const cur = relics[state.relic] || cloneCapture(emptyCapture());
    return Object.assign({}, cur, {
      relic: state.relic,
      level: state.level,
      mode: state.mode,
      grades: Object.assign({}, state.grades),
      gradeEnhance: Object.assign({}, state.gradeEnhance),
      relics,
    });
  }

  function toggleSave(i) {
    if (state.saved[i]) {
      state.saved[i] = null;
      closeCompare();
      closeSetPrompt();
      renderSaveBar();
      return;
    }
    state.saved[i] = snapshotNow();
    renderSaveBar();
    if (state.saved[0] && state.saved[1]) openSetPrompt();
  }

  function clearSavedSets() {
    state.saved = [null, null];
    closeCompare();
    closeSetPrompt();
    renderSaveBar();
  }

  function anyOverlayOpen() {
    return ["set-prompt", "cmp-overlay", "card-choice", "card-book", "card-own", "save-notice", "prefs-import", "prefs-import-done", "deck-export", "stat-guide", "stat-guide-soon"].some((id) => {
      const n = el(id);
      return n && n.classList.contains("show");
    });
  }

  function renderStatGuideBody() {
    const box = el("stat-guide-body");
    if (!box) return;
    const curMode = state.mode === "PVP" ? "PVP" : "PVE";
    const tiers = BIND_DATA.tiers || {};
    box.innerHTML = RELIC_ORDER.map((r) => {
      const modes = ["PVE", "PVP"]
        .map((m) => {
          const list = ((tiers[r] || {})[m] || [])
            .slice()
            .sort((a, b) => (a.tier || 0) - (b.tier || 0));
          const rows = list.length
            ? list.map((t) => `<li>${t.tier}티어 · ${escapeHtml(t.stat)}</li>`).join("")
            : `<li>데이터 없음</li>`;
          return `<div class="stat-guide-mode${m === curMode ? " cur" : ""}"><b>${m}${m === curMode ? " · 현재" : ""}</b><ol>${rows}</ol></div>`;
        })
        .join("");
      return `<section class="stat-guide-relic"><h3>${r}의 성물</h3><div class="stat-guide-modes">${modes}</div></section>`;
    }).join("");
  }

  function openStatGuide() {
    renderStatGuideBody();
    closeStatGuideSoon(true);
    const msg = el("stat-guide-msg");
    if (msg) {
      msg.textContent =
        "현재 추천에 쓰는 기본 우선순위입니다. 1티어가 가장 선호하는 스탯이며, 보드의 PVE / PVP 버튼에 맞춰 적용됩니다.";
      msg.style.color = "#c8f0c8";
    }
    const box = el("stat-guide");
    if (box) box.classList.add("show");
    const guideBox = box && box.querySelector(".stat-guide-box");
    if (guideBox) bindDragScroll(guideBox);
    lockPage();
  }

  function closeStatGuide() {
    closeStatGuideSoon(true);
    const box = el("stat-guide");
    if (box) box.classList.remove("show");
    unlockPage();
  }

  function openStatGuideSoon() {
    const box = el("stat-guide-soon");
    if (box) box.classList.add("show");
    lockPage();
  }

  function closeStatGuideSoon(keepLock) {
    const box = el("stat-guide-soon");
    if (box) box.classList.remove("show");
    if (!keepLock) unlockPage();
  }

  function deckExportText() {
    const cards = cardIndex();
    const lines = ["[이클립스 결속 추천 목록]", "모드: " + state.mode, ""];
    for (const r of RELIC_ORDER) {
      lines.push("■ " + r + "의 성물");
      if (!state.relicEnabled[r]) {
        lines.push("(성물 꺼짐)", "");
        continue;
      }
      const snap = state.relicDecks[r];
      if (!snap || !snap.names || !snap.names.length) {
        lines.push("Lv." + levelOf(r), "(배치된 카드 없음)", "");
        continue;
      }
      lines.push("Lv." + (snap.level || levelOf(r)));
      const placed = assignSlots(snap.names, cards, r);
      let n = 0;
      for (const slot of placed) {
        if (!slot.card) continue;
        n += 1;
        const g = slot.card.grade;
        const enh =
          snap.gradeEnhance && snap.gradeEnhance[g] != null
            ? Number(snap.gradeEnhance[g]) || 0
            : enhanceOf(g);
        lines.push(n + ". " + g + " · " + enh + "강 · " + slot.card.name);
      }
      if (!n) lines.push("(배치된 카드 없음)");
      lines.push("");
    }
    lines.push("※ 위 목록을 보고 인게임 결속에 같은 카드를 등록하세요.");
    return lines.join("\n").replace(/\n+$/, "\n");
  }

  function openDeckExport() {
    const ta = el("deck-export-code");
    const msg = el("deck-export-msg");
    if (ta) ta.value = deckExportText();
    if (msg) {
      msg.textContent = "성물별 추천 카드 목록입니다. 복사해 카톡 등으로 공유한 뒤, 인게임 결속에 등록하세요.";
      msg.style.color = "#c8f0c8";
    }
    const box = el("deck-export");
    if (box) box.classList.add("show");
    lockPage();
  }

  function closeDeckExport() {
    const box = el("deck-export");
    if (box) box.classList.remove("show");
    unlockPage();
  }

  async function copyDeckExport() {
    const ta = el("deck-export-code");
    if (!ta) return;
    if (!ta.value) ta.value = deckExportText();
    const text = ta.value;
    const msg = el("deck-export-msg");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        ta.focus();
        ta.select();
        document.execCommand("copy");
      }
      if (msg) {
        msg.textContent = "텍스트를 복사했습니다. 카톡·메모장에 붙여 넣으세요.";
        msg.style.color = "#c8f0c8";
      }
    } catch (err) {
      if (ta) {
        ta.focus();
        ta.select();
      }
      if (msg) {
        msg.textContent = "자동 복사에 실패했습니다. 텍스트를 직접 선택해 복사하세요.";
        msg.style.color = "#ff8b8b";
      }
    }
  }

  function downloadDeckExport() {
    const ta = el("deck-export-code");
    const text = (ta && ta.value) || deckExportText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "이클립스-결속목록.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    const msg = el("deck-export-msg");
    if (msg) {
      msg.textContent = "텍스트 파일을 저장했습니다.";
      msg.style.color = "#c8f0c8";
    }
  }

  function lockPage() {
    if (document.body.dataset.scrollLock === "1") return;
    const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.body.dataset.scrollLock = "1";
    document.body.dataset.scrollY = String(window.scrollY);
    document.body.style.overflow = "hidden";
    if (gap) document.body.style.paddingRight = gap + "px";
  }

  function unlockPage() {
    if (anyOverlayOpen()) return;
    if (document.body.dataset.scrollLock !== "1") return;
    const y = Number(document.body.dataset.scrollY || 0);
    delete document.body.dataset.scrollLock;
    delete document.body.dataset.scrollY;
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
    window.scrollTo(0, y);
  }

  function openSetPrompt() {
    const box = el("set-prompt");
    if (!box) return;
    box.classList.add("show");
    lockPage();
  }

  function closeSetPrompt() {
    const box = el("set-prompt");
    if (!box) return;
    box.classList.remove("show");
    unlockPage();
  }

  function gradeEnhanceLine(snap) {
    return BIND_DATA.grades
      .filter((g) => snap.grades[g])
      .map((g) => `${g} ${snap.gradeEnhance[g] || 0}강`)
      .join(" · ");
  }

  function parseEffectNum(text) {
    const m = String(text).match(/^(.*?)(?:\s+([\d.]+)(%|초)?)$/);
    if (!m) return { name: String(text).trim(), value: 0, unit: "" };
    return { name: m[1].trim(), value: Number(m[2]) || 0, unit: m[3] || "" };
  }

  function summedEffects(snap) {
    const map = new Map();
    if (!snap || !snap.pts || !snap.relic) return map;
    const opened = effectLines(snap.relic, snap.pts);
    for (const g of BIND_DATA.grades) {
      for (const e of opened[g] || []) {
        const p = parseEffectNum(e.text);
        const key = p.name + "\0" + p.unit;
        const cur = map.get(key) || { name: p.name, unit: p.unit, value: 0 };
        cur.value += p.value;
        map.set(key, cur);
      }
    }
    return map;
  }

  function fmtStatAmt(v, unit) {
    const n = Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(Math.round(v * 1000) / 1000);
    return n + (unit || "");
  }

  function statTotalsFromMaps(mine, theirs, tierFn, compare) {
    const keys = new Map();
    for (const [k, s] of mine) keys.set(k, s);
    for (const [k, s] of theirs) if (!keys.has(k)) keys.set(k, s);
    const rows = [...keys.values()].sort((a, b) => {
      const ta = tierFn(a.name) || 99;
      const tb = tierFn(b.name) || 99;
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name, "ko");
    });
    if (!rows.length) {
      return `<div class="stat-sum"><div class="stat-sum-head">결속 효과 총합</div><p class="mute">효과 없음</p></div>`;
    }
    const body = rows
      .map((s) => {
        const key = s.name + "\0" + s.unit;
        const v = mine.has(key) ? mine.get(key).value : 0;
        const ov = theirs.has(key) ? theirs.get(key).value : 0;
        const win = compare && v > ov ? " win" : "";
        const zero = v === 0 ? " zero" : "";
        const t = tierFn(s.name);
        const tcls = t ? ` t-${t}` : "";
        const tag = t ? `<i class="tier">${t}티어</i>` : `<i class="tier"></i>`;
        return `<div class="stat-sum-row${tcls}${win}${zero}"><span>${escapeHtml(s.name)}</span>${tag}<b>${fmtStatAmt(
          v,
          s.unit
        )}</b></div>`;
      })
      .join("");
    return `<div class="stat-sum"><div class="stat-sum-head">결속 효과 총합</div>${body}</div>`;
  }

  function statTotalsHtml(snap, other) {
    const relic = (snap && snap.relic) || state.relic;
    const mode = (snap && snap.mode) || state.mode;
    return statTotalsFromMaps(
      summedEffects(snap),
      other ? summedEffects(other) : new Map(),
      (name) => tierOfStat(name, relic, mode),
      !!other
    );
  }

  function savedRelics(saved) {
    if (saved && saved.relics) return saved.relics;
    const out = {};
    for (const r of RELIC_ORDER) out[r] = null;
    if (saved && saved.relic) out[saved.relic] = saved;
    return out;
  }

  function snapForRelic(saved, relic) {
    const pack = savedRelics(saved);
    if (pack[relic]) return pack[relic];
    const empty = emptyCapture();
    empty.relic = relic;
    if (saved) {
      empty.level = saved.level;
      empty.mode = saved.mode;
      empty.grades = Object.assign({}, saved.grades || {});
      empty.gradeEnhance = Object.assign({}, saved.gradeEnhance || {});
    }
    return empty;
  }

  function summedEffectsAll(saved) {
    const map = new Map();
    const pack = savedRelics(saved);
    for (const r of RELIC_ORDER) {
      const part = summedEffects(pack[r]);
      for (const [k, s] of part) {
        const cur = map.get(k) || { name: s.name, unit: s.unit, value: 0 };
        cur.value += s.value;
        map.set(k, cur);
      }
    }
    return map;
  }

  function combinedTierFn(saved) {
    return (name) => {
      let best = 0;
      const pack = savedRelics(saved);
      for (const r of RELIC_ORDER) {
        const snap = pack[r];
        if (!snap) continue;
        const t = tierOfStat(name, r, snap.mode || saved.mode);
        if (t && (!best || t < best)) best = t;
      }
      return best;
    };
  }

  function fxListHtml(snap, other) {
    if (!snap || !snap.pts) return `<p class="mute">연 효과 없음</p>`;
    const opened = effectLines(snap.relic, snap.pts);
    const otherOpen = other ? effectLines(other.relic, other.pts) : {};
    const grades = BIND_DATA.grades.filter((g) => snap.grades[g] || (other && other.grades[g]));
    if (!grades.length) return `<p class="mute">연 효과 없음</p>`;
    return grades
      .map((g) => {
        const rows = opened[g] || [];
        const last = rows.length ? rows[rows.length - 1].at : 0;
        const otherAt = new Set((otherOpen[g] || []).map((e) => e.at));
        const list = rows.length
          ? rows
              .map((e) => {
                const t = tierOfStat(effectStatName(e.text), snap.relic, snap.mode);
                const tag = t ? `<i class="tier">${t}티어</i>` : "";
                const only = other && !otherAt.has(e.at) ? " only" : "";
                return `<li class="${t ? "t-" + t : ""}${only}"><b>${e.at}</b> ${escapeHtml(e.text)}${tag}</li>`;
              })
              .join("")
          : "<li class='mute'>아직 구간 없음</li>";
        return `<div class="fx"><h3>${g} ${snap.pts[g]}p${last ? ` · ${last} 구간까지` : ""}</h3><ul>${list}</ul></div>`;
      })
      .join("");
  }

  function cmpSnapCore(snap, other) {
    const score = BIND_DATA.grades
      .map((g) => {
        const win = other && snap.pts[g] > other.pts[g] ? " win" : "";
        return `<div class="p g-${RANK[g]}${win}"><b>${snap.pts[g] || 0}</b><span>${g}</span></div>`;
      })
      .join("");
    const rec = `추천 ${snap.names.length}장${snap.unused ? ` · 빈 칸 ${snap.unused}` : ""} · 3장 ${snap.n3 || 0} · 2장 ${
      snap.n2 || 0
    } · 한장 ${snap.n1 || 0}`;
    const pairList = snap.pairs && snap.pairs.length
      ? `<ul class="lines">${snap.pairs
          .map(
            (p) =>
              `<li><b>${p.grade} ${p.size}장 ${p.enhance}강</b> ${escapeHtml(p.cards.join(" · "))}</li>`
          )
          .join("")}</ul>`
      : `<p class="mute">켜진 페어 없음</p>`;
    const pairN = snap.pairs ? snap.pairs.length : 0;
    return {
      rec,
      html: `
      <div class="score">${score}</div>
      <details class="cmp-fold">
        <summary>결속조합 ${pairN}</summary>
        ${pairList}
      </details>
      <details class="cmp-fold">
        <summary>결속 효과 포인트 · 구간 스탯</summary>
        <div class="fx-wrap">${fxListHtml(snap, other)}</div>
      </details>`,
    };
  }

  function cmpColHtml(title, snap, other) {
    const core = cmpSnapCore(snap, other);
    return `<div class="cmp-col">
      <h3>${title}</h3>
      <p class="cmp-meta">${escapeHtml(snap.relic)}의 성물 · Lv.${snap.level || snap.slots} · ${snap.mode}<br>${escapeHtml(
        gradeEnhanceLine(snap) || "등급 없음"
      )}<br>${escapeHtml(core.rec)}</p>
      <div class="stat-sum-wrap">${statTotalsHtml(snap, other)}</div>
      ${core.html}
    </div>`;
  }

  function cmpAllColHtml(title, saved, other) {
    const totals = statTotalsFromMaps(
      summedEffectsAll(saved),
      summedEffectsAll(other),
      combinedTierFn(saved),
      true
    );
    const pack = savedRelics(saved);
    const otherPack = savedRelics(other);
    const folds = RELIC_ORDER.map((r) => {
      const snap = pack[r];
      const oth = otherPack[r];
      if (!snap) {
        return `<details class="cmp-fold"><summary>${r}의 성물 · 없음</summary><p class="mute">이 세트에 저장된 결속이 없습니다.</p></details>`;
      }
      const core = cmpSnapCore(snap, oth);
      return `<details class="cmp-fold"><summary>${r}의 성물 · Lv.${snap.level || snap.slots}</summary>
        <p class="cmp-meta">${escapeHtml(core.rec)}</p>
        ${core.html}
      </details>`;
    }).join("");
    return `<div class="cmp-col">
      <h3>${title}</h3>
      <p class="cmp-meta">전체 성물 · Lv.${saved.level || saved.slots || 1} · ${saved.mode}<br>${escapeHtml(
        gradeEnhanceLine(saved) || "등급 없음"
      )}</p>
      <div class="stat-sum-wrap">${totals}</div>
      ${folds}
    </div>`;
  }

  function showCompareOverlay(html, title) {
    const head = el("cmp-title");
    if (head) head.textContent = title;
    el("cmp-body").innerHTML = html;
    el("cmp-overlay").classList.add("show");
    lockPage();
  }

  function openCompareCurrent() {
    if (!state.saved[0] || !state.saved[1]) return;
    const r = state.relic;
    const a = snapForRelic(state.saved[0], r);
    const b = snapForRelic(state.saved[1], r);
    showCompareOverlay(
      cmpColHtml("A SET", a, b) + cmpColHtml("B SET", b, a),
      `A / B 비교 · ${r}의 성물`
    );
  }

  function openCompareAll() {
    if (!state.saved[0] || !state.saved[1]) return;
    showCompareOverlay(
      cmpAllColHtml("A SET", state.saved[0], state.saved[1]) + cmpAllColHtml("B SET", state.saved[1], state.saved[0]),
      "A / B 비교 · 전체 성물"
    );
  }

  function openCompare() {
    openCompareCurrent();
  }

  function closeCompare() {
    el("cmp-overlay").classList.remove("show");
    if (state.saved[0] && state.saved[1]) openSetPrompt();
    else unlockPage();
  }

  function cardMeta(name) {
    return cardIndex().get(name) || { name, grade: "희귀", rank: 1 };
  }

  function placedSlotOf(name) {
    if (!name) return null;
    const cards = cardIndex();
    const names = lastCapture ? lastCapture.names : [];
    const i = assignSlots(names, cards).findIndex((s) => s.card && s.card.name === name);
    return i >= 0 ? i : null;
  }

  function openCardChoice(name, slot) {
    choiceName = name || null;
    choiceSlot = slot != null && slot !== "" ? Number(slot) : placedSlotOf(name);
    const c = name ? cardMeta(name) : null;
    const img = el("card-choice-img");
    const title = el("card-choice-name");
    const grade = el("card-choice-grade");
    if (img) {
      if (name) {
        img.src = portraitSrc(name);
        img.alt = name;
        img.style.visibility = "";
      } else {
        img.removeAttribute("src");
        img.alt = "";
        img.style.visibility = "hidden";
      }
    }
    if (title) title.textContent = name || "빈 칸";
    if (grade) {
      const need = choiceSlot != null ? SLOT_DEFS[choiceSlot].need : "";
      grade.textContent = (c ? c.grade : "") + (need ? (c ? " · " : "") + need : "");
    }
    el("card-choice").classList.add("show");
    lockPage();
  }

  function closeCardChoice() {
    el("card-choice").classList.remove("show");
    unlockPage();
  }

  function renderCardBook() {
    const tabs = el("card-book-tabs");
    const grid = el("card-book-grid");
    if (!tabs || !grid) return;
    tabs.innerHTML = BIND_DATA.grades
      .map((g) => {
        const n = (BIND_DATA.hanjang[g] || []).length;
        const on = bookGrade === g ? " on" : "";
        return `<button type="button" class="book-tab g-${RANK[g]}${on}" data-book-grade="${g}">${g} ${n}</button>`;
      })
      .join("");
    const minRank = choiceSlot != null ? SLOT_DEFS[choiceSlot].min : 1;
    if (RANK[bookGrade] < minRank) {
      grid.innerHTML = `<p class="mute">이 칸은 ${escapeHtml(SLOT_DEFS[choiceSlot].need)}입니다.</p>`;
      return;
    }
    const list = (BIND_DATA.hanjang[bookGrade] || []).slice().sort((a, b) => a.name.localeCompare(b.name, "ko"));
    grid.innerHTML = list
      .map((c) => {
        const ex = state.excluded.has(c.name);
        const taken = takenRelicOf(c.name);
        const src = choiceName === c.name;
        const ok = !taken && RANK[c.grade] >= minRank;
        return `<button type="button" class="book-card g-${RANK[c.grade]}${src ? " is-src" : ""}${ex ? " is-ex" : ""}${
          taken ? " is-taken" : ""
        }"${ok ? ` data-book-pick="${escapeAttr(c.name)}"` : " disabled"} title="${
          taken ? escapeAttr(taken + "에서 사용 중") : "클릭해서 이 칸에 등록"
        }">
          <img src="${portraitSrc(c.name)}" alt="" onerror="this.style.visibility='hidden'">
          <strong>${escapeHtml(c.name)}</strong>
        </button>`;
      })
      .join("");
    bindDragScroll(grid);
  }

  function openCardBook(grade) {
    const c = choiceName ? cardMeta(choiceName) : null;
    const minG = choiceSlot != null ? RANK_NAME[SLOT_DEFS[choiceSlot].min] : "";
    bookGrade = grade || (c && c.grade) || minG || "희귀";
    renderCardBook();
    el("card-book").classList.add("show");
    lockPage();
    el("card-choice").classList.remove("show");
  }

  function openCardBookForSlot(slot) {
    choiceSlot = slot;
    const pins = state.pinned[state.relic] || [];
    choiceName = pins[slot] || null;
    if (!choiceName && lastCapture) {
      const placed = assignSlots(lastCapture.names, cardIndex());
      choiceName = placed[slot] && placed[slot].card ? placed[slot].card.name : null;
    }
    openCardBook();
  }

  function firstSlotFor(card) {
    const cards = cardIndex();
    const names = lastCapture ? lastCapture.names : [];
    const placed = assignSlots(names, cards);
    const level = levelOf(state.relic);
    if (choiceSlot != null && card.rank >= SLOT_DEFS[choiceSlot].min && SLOT_DEFS[choiceSlot].unlock <= level) {
      return choiceSlot;
    }
    if (choiceName) {
      const cur = placed.findIndex((s) => s.card && s.card.name === choiceName);
      if (cur >= 0 && card.rank >= SLOT_DEFS[cur].min) return cur;
    }
    for (let i = 0; i < SLOT_DEFS.length; i++) {
      const d = SLOT_DEFS[i];
      if (d.unlock > level || card.rank < d.min) continue;
      if (!placed[i].card) return i;
    }
    for (let i = SLOT_DEFS.length - 1; i >= 0; i--) {
      const d = SLOT_DEFS[i];
      if (d.unlock > level || card.rank < d.min) continue;
      return i;
    }
    return null;
  }

  function registerCard(name) {
    const cards = cardIndex();
    const card = cards.get(name);
    if (!card) return;
    if (takenRelicOf(name)) return;
    const slot = firstSlotFor(card);
    if (slot == null) return;
    if (card.rank < SLOT_DEFS[slot].min || SLOT_DEFS[slot].unlock > levelOf(state.relic)) return;
    state.excluded.delete(name);
    state.grades[card.grade] = true;
    state.relicEnabled[state.relic] = true;
    if (!state.pinned[state.relic]) state.pinned[state.relic] = SLOT_DEFS.map(() => null);
    const pins = state.pinned[state.relic];
    for (let i = 0; i < pins.length; i++) if (pins[i] === name) pins[i] = null;
    pins[slot] = name;
    choiceName = name;
    choiceSlot = slot;
    markDirtyFrom(state.relic);
    closeCardBook();
    closeCardChoice();
    draw();
  }

  function closeCardBook() {
    el("card-book").classList.remove("show");
    unlockPage();
  }

  function knownCardNames() {
    const set = new Set();
    for (const g of BIND_DATA.grades) {
      for (const c of BIND_DATA.hanjang[g] || []) set.add(c.name);
    }
    return set;
  }

  function prefsPayload() {
    const pinned = {};
    for (const r of RELIC_ORDER) {
      pinned[r] = (state.pinned[r] || SLOT_DEFS.map(() => null)).map((n) => n || null);
    }
    return {
      v: 1,
      excluded: [...state.excluded],
      grades: Object.assign({}, state.grades),
      gradeEnhance: Object.assign({}, state.gradeEnhance),
      mode: state.mode,
      level: state.level,
      relicLevels: Object.assign({}, state.relicLevels),
      relic: state.relic,
      relicEnabled: Object.assign({}, state.relicEnabled),
      pinned,
      savedAt: Date.now(),
    };
  }

  function encodePrefsCode(data) {
    const json = JSON.stringify(data || prefsPayload());
    const b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    return "ECLIPSEBIND1." + b64;
  }

  function decodePrefsCode(code) {
    const raw = String(code || "").trim().replace(/\s+/g, "");
    const m = raw.match(/^(?:ECLIPSEBIND1\.)?([A-Za-z0-9\-_]+)$/);
    if (!m) throw new Error("bad-code");
    let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = decodeURIComponent(escape(atob(b64)));
    const data = JSON.parse(json);
    if (!data || typeof data !== "object") throw new Error("bad-data");
    return data;
  }

  function applyPrefsData(data) {
    if (!data || typeof data !== "object") return false;
    const known = knownCardNames();
    if (Array.isArray(data.excluded)) {
      state.excluded = new Set(data.excluded.filter((n) => known.has(n)));
    }
    if (data.grades && typeof data.grades === "object") {
      for (const g of BIND_DATA.grades) {
        if (typeof data.grades[g] === "boolean") state.grades[g] = data.grades[g];
      }
    }
    if (data.gradeEnhance && typeof data.gradeEnhance === "object") {
      for (const g of BIND_DATA.grades) {
        if (data.gradeEnhance[g] != null) state.gradeEnhance[g] = Number(data.gradeEnhance[g]) || 0;
      }
    }
    if (data.mode === "PVE" || data.mode === "PVP") state.mode = data.mode;
    if (data.relicLevels && typeof data.relicLevels === "object") {
      for (const r of RELIC_ORDER) {
        const lv = Number(data.relicLevels[r]);
        if (RELIC_LEVELS.indexOf(lv) >= 0) state.relicLevels[r] = lv;
      }
    } else if (RELIC_LEVELS.indexOf(Number(data.level)) >= 0) {
      const lv = Number(data.level);
      for (const r of RELIC_ORDER) state.relicLevels[r] = lv;
    }
    if (RELIC_ORDER.indexOf(data.relic) >= 0) state.relic = data.relic;
    syncCurrentLevel();
    if (data.relicEnabled && typeof data.relicEnabled === "object") {
      for (const r of RELIC_ORDER) {
        if (typeof data.relicEnabled[r] === "boolean") state.relicEnabled[r] = data.relicEnabled[r];
      }
    }
    if (data.pinned && typeof data.pinned === "object") {
      for (const r of RELIC_ORDER) {
        const src = data.pinned[r];
        if (!Array.isArray(src)) continue;
        state.pinned[r] = SLOT_DEFS.map((_, i) => {
          const n = src[i];
          return n && known.has(n) ? n : null;
        });
      }
    }
    markDirtyFrom(null);
    return true;
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefsPayload()));
      return true;
    } catch (err) {
      return false;
    }
  }

  function fillExportCode() {
    const ta = el("prefs-export-code");
    if (ta) ta.value = encodePrefsCode(prefsPayload());
  }

  function ownedCountByGrade() {
    const out = {};
    for (const g of BIND_DATA.grades) {
      const list = BIND_DATA.hanjang[g] || [];
      out[g] = list.filter((c) => !state.excluded.has(c.name)).length;
    }
    return out;
  }

  function closeSaveNotice() {
    const box = el("save-notice");
    if (box) box.classList.remove("show");
    unlockPage();
  }

  function showPrefsSaveNote(ok) {
    const note = el("grade-note-load");
    if (!note) return;
    note.hidden = false;
    note.textContent = ok
      ? "내 카드를 저장했습니다."
      : "저장에 실패했습니다. 시크릿 모드이거나 저장 공간이 부족할 수 있습니다.";
    note.style.color = ok ? "#c8f0c8" : "#ff8b8b";
  }

  function openExportPopup() {
    savePrefs();
    fillExportCode();
    const msg = el("save-notice-ok");
    if (msg) {
      msg.textContent = "아래 코드를 복사해 다른 기기로 보내세요.";
      msg.style.color = "#c8f0c8";
    }
    const title = el("save-notice-title");
    if (title) title.textContent = "내 카드 목록 내려받기";
    const box = el("save-notice");
    if (box) box.classList.add("show");
    lockPage();
  }

  function openImportPopup() {
    const box = el("prefs-import");
    const ta = el("prefs-import-code");
    const msg = el("prefs-import-msg");
    if (ta) ta.value = "";
    if (msg) {
      msg.textContent = "다른 기기에서 복사한 코드를 붙여 넣으세요.";
      msg.style.color = "var(--muted)";
    }
    if (box) box.classList.add("show");
    lockPage();
    if (ta) setTimeout(() => ta.focus(), 0);
  }

  function closeImportPopup() {
    const box = el("prefs-import");
    if (box) box.classList.remove("show");
    unlockPage();
  }

  async function copyExportCode() {
    const ta = el("prefs-export-code");
    if (!ta || !ta.value) fillExportCode();
    const text = (el("prefs-export-code") || {}).value || "";
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        ta.focus();
        ta.select();
        document.execCommand("copy");
      }
      const msg = el("save-notice-ok");
      if (msg) {
        msg.textContent = "코드를 복사했습니다. 다른 기기에 붙여 넣으세요.";
        msg.style.color = "#c8f0c8";
      }
    } catch (err) {
      if (ta) {
        ta.focus();
        ta.select();
      }
    }
  }

  function renderImportCounts() {
    const box = el("prefs-import-counts");
    if (!box) return;
    const counts = ownedCountByGrade();
    box.innerHTML = BIND_DATA.grades
      .map((g) => {
        const n = counts[g] || 0;
        const total = (BIND_DATA.hanjang[g] || []).length;
        return `<div class="g-${RANK[g]}"><b>${n}</b><span>${g} · 전체 ${total}</span></div>`;
      })
      .join("");
  }

  function openImportDone() {
    renderImportCounts();
    const box = el("prefs-import-done");
    if (box) box.classList.add("show");
    lockPage();
  }

  function closeImportDone() {
    const box = el("prefs-import-done");
    if (box) box.classList.remove("show");
    unlockPage();
  }

  function importPrefsFromInput() {
    const ta = el("prefs-import-code");
    const msg = el("prefs-import-msg");
    try {
      const data = decodePrefsCode(ta ? ta.value : "");
      if (!applyPrefsData(data)) throw new Error("apply");
      savePrefs();
      closeImportPopup();
      draw();
      const note = el("grade-note-load");
      if (note) {
        note.hidden = false;
        note.textContent = "코드로 내 카드를 불러왔습니다.";
      }
      openImportDone();
    } catch (err) {
      if (msg) {
        msg.textContent = "코드가 올바르지 않습니다. 전체를 다시 복사해 붙여 넣어 주세요.";
        msg.style.color = "#ff8b8b";
      }
    }
  }

  function savePrefsManual() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    return savePrefs();
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      savePrefs();
    }, 120);
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return applyPrefsData(data);
    } catch (err) {
      return false;
    }
  }

  function rememberScroll() {
    savedScrollY = window.scrollY;
  }

  function restoreScroll() {
    if (savedScrollY == null) return;
    const y = savedScrollY;
    savedScrollY = null;
    const apply = () => window.scrollTo(0, y);
    apply();
    requestAnimationFrame(apply);
  }

  function excludeCard(name) {
    if (!name) return;
    const from = relicUsingCard(name);
    state.excluded.add(name);
    for (const r of RELIC_ORDER) {
      const pins = state.pinned[r];
      if (!pins) continue;
      for (let i = 0; i < pins.length; i++) if (pins[i] === name) pins[i] = null;
    }
    markDirtyFrom(from);
    closeCardChoice();
    closeCardBook();
    requestQuietDraw();
  }

  function includeCard(name) {
    if (!name) return;
    state.excluded.delete(name);
    markDirtyFrom(null);
    requestQuietDraw();
  }

  function ownCardsOfGrade(grade) {
    return (BIND_DATA.hanjang[grade] || []).slice().sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  function renderCardOwn() {
    const body = el("card-own-body");
    const title = el("card-own-title");
    if (!body || !ownGrade) return;
    if (title) title.textContent = ownGrade + " 보유 카드 선택";
    const list = ownCardsOfGrade(ownGrade);
    const groups = [
      { key: "초월", label: "초월", items: list.filter((c) => c.kind !== "무기외형") },
      { key: "무기외형", label: "무기외형", items: list.filter((c) => c.kind === "무기외형") },
    ];
    body.innerHTML = groups
      .filter((g) => g.items.length)
      .map((g) => {
        const cards = g.items
          .map((c) => {
            const ex = state.excluded.has(c.name);
            return `<button type="button" class="own-card g-${RANK[c.grade]}${ex ? " is-ex" : " is-on"}" data-own-toggle="${escapeAttr(
              c.name
            )}" title="${escapeAttr(c.name)} · ${ex ? "제외됨 · 누르면 선택" : "선택됨 · 누르면 제외"}">
              <img src="${portraitSrc(c.name)}" alt="" onerror="this.style.visibility='hidden'">
              <strong>${escapeHtml(c.name)}</strong>
              <span class="own-state">${ex ? "제외" : "선택"}</span>
            </button>`;
          })
          .join("");
        return `<section class="own-sec"><h3>${g.label}<em>${g.items.length}</em></h3><div class="own-grid">${cards}</div></section>`;
      })
      .join("");
    bindDragScroll(body);
  }

  function openCardOwn(grade) {
    ownGrade = grade;
    ownDirty = false;
    renderCardOwn();
    const box = el("card-own");
    if (box) box.classList.add("show");
    lockPage();
  }

  function closeCardOwn(runDraw) {
    const box = el("card-own");
    if (box) box.classList.remove("show");
    unlockPage();
    const g = ownGrade;
    ownGrade = null;
    if (ownDirty || runDraw) {
      ownDirty = false;
      markDirtyFrom(null);
      requestQuietDraw();
    }
    return g;
  }

  function toggleOwnCard(name) {
    if (!name) return;
    if (state.excluded.has(name)) state.excluded.delete(name);
    else state.excluded.add(name);
    ownDirty = true;
    scheduleSave();
    renderCardOwn();
  }

  function setOwnGradeAll(select) {
    if (!ownGrade) return;
    for (const c of ownCardsOfGrade(ownGrade)) {
      if (select) state.excluded.delete(c.name);
      else state.excluded.add(c.name);
    }
    ownDirty = true;
    scheduleSave();
    renderCardOwn();
  }

  function disableOwnGrade() {
    if (!ownGrade) return;
    state.grades[ownGrade] = false;
    ownDirty = true;
    closeCardOwn(true);
  }

  function finishCardOwnAndSave() {
    closeCardOwn(true);
    showPrefsSaveNote(savePrefsManual());
  }

  function requestQuietDraw() {
    rememberScroll();
    scheduleSave();
    if (quietDrawTimer) clearTimeout(quietDrawTimer);
    quietDrawTimer = setTimeout(() => {
      quietDrawTimer = null;
      draw({ quiet: true });
    }, 30);
  }

  function el(id) {
    return document.getElementById(id);
  }

  function renderControls(opts) {
    const quiet = !!(opts && opts.quiet);
    const box = el("grades");
    const owned = ownedCountByGrade();
    if (quiet && box && box.querySelector(".grade-btn")) {
      for (const g of BIND_DATA.grades) {
        const ptsEl = box.querySelector(`[data-grade="${g}"] .gpts`);
        if (ptsEl) {
          const on = !!state.grades[g];
          ptsEl.textContent = on && lastCapture ? lastCapture.pts[g] || 0 : 0;
        }
        const ownEl = box.querySelector(`.grow.g-${RANK[g]} .g-own`);
        if (ownEl) ownEl.textContent = `내 카드 ${owned[g] || 0}장`;
      }
      renderGradeFx();
      return;
    }
    box.innerHTML = BIND_DATA.grades
      .map((g) => {
        const on = !!state.grades[g];
        const pts = on && lastCapture ? lastCapture.pts[g] || 0 : 0;
        const ownN = owned[g] || 0;
        const src = "등급/" + encodeURIComponent(g) + "-" + (on ? "on" : "off") + ".png?v=64";
        const enh = ENH_OPTS.map(
          (n) =>
            `<button type="button" class="${enhanceOf(g) === n ? "on" : ""}" data-g-enh="${g}" data-n="${n}">${n}강</button>`
        ).join("");
        return `<div class="grow g-${RANK[g]}">
          <div class="grade-stack">
            <button type="button" class="grade-btn g-${RANK[g]}${on ? " on" : ""}" data-grade="${g}" aria-pressed="${on}" aria-label="${g}" title="${g}${on ? " 보유 카드 선택" : " 켜고 보유 카드 선택"}">
              <img src="${src}" alt="">
              <b class="gpts" aria-hidden="true">${pts}</b>
            </button>
            <span class="g-own">내 카드 ${ownN}장</span>
          </div>
          <div class="g-enh">${enh}</div>
        </div>`;
      })
      .join("");
    renderGradeFx();
  }

  function gradePtsNow(g) {
    if (!lastCapture || !state.grades[g]) return 0;
    return lastCapture.pts[g] || 0;
  }

  function renderGradeFx() {
    const box = el("grade-fx");
    const btn = el("grade-fx-toggle");
    if (!box || !btn) return;
    const label = btn.querySelector("span");
    btn.setAttribute("aria-expanded", gradeFxOpen ? "true" : "false");
    if (label) label.textContent = gradeFxOpen ? "결속 효과 접기" : "결속 효과 보기";
    box.hidden = !gradeFxOpen;
    if (!gradeFxOpen) return;

    const scrolls = {};
    box.querySelectorAll("[data-fx-grade]").forEach((sc) => {
      scrolls[sc.dataset.fxGrade] = sc.scrollTop;
    });

    const tracks = (BIND_DATA.effects && BIND_DATA.effects[state.relic]) || {};
    const hasCards = !!(lastCapture && lastCapture.names && lastCapture.names.length);
    box.innerHTML = BIND_DATA.grades
      .map((g) => {
        const p = gradePtsNow(g);
        const list = tracks[g] || [];
        const rows = list.length
          ? list
              .map((e) => {
                const on = p >= e.at;
                return `<li class="${on ? "on" : "off"}"><i class="fx-at">${e.at}</i><span>${escapeHtml(e.text)}</span></li>`;
              })
              .join("")
          : `<li class="off"><span class="grade-fx-empty">효과 데이터 없음</span></li>`;
        const note = !hasCards
          ? `<p class="grade-fx-empty">추천 카드 없음</p>`
          : !state.grades[g]
            ? `<p class="grade-fx-empty">등급 꺼짐</p>`
            : "";
        return `<div class="grade-fx-col g-${RANK[g]}">
          <div class="grade-fx-head"><b>${g}</b><em>${p}p</em></div>
          ${note}
          <ul class="grade-fx-list" data-fx-grade="${g}">${rows}</ul>
        </div>`;
      })
      .join("");

    box.querySelectorAll("[data-fx-grade]").forEach((sc) => {
      const g = sc.dataset.fxGrade;
      if (scrolls[g] != null) {
        sc.scrollTop = scrolls[g];
      } else {
        const p = gradePtsNow(g);
        const firstOff = sc.querySelector("li.off");
        if (p > 0 && firstOff) {
          const top = Math.max(0, firstOff.offsetTop - sc.clientHeight * 0.45);
          sc.scrollTop = top;
        }
      }
      bindDragScroll(sc, { blockWheel: true });
    });
  }

  function bindDragScroll(list, opts) {
    if (!list || list.dataset.dragBound === "1") return;
    list.dataset.dragBound = "1";
    list.classList.add("drag-scroll");
    const blockWheel = !!(opts && opts.blockWheel);
    let dragging = false;
    let moved = false;
    let pointerId = null;
    let startY = 0;
    let startTop = 0;

    if (blockWheel) {
      // 휠/트랙패드는 페이지 스크롤만 — 목록은 클릭·터치 드래그로만 이동
      list.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.scrollBy(0, e.deltaY);
        },
        { passive: false }
      );
    }

    list.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target.closest("input, textarea, select, option")) return;
      if (list.scrollHeight <= list.clientHeight + 1) return;
      dragging = true;
      moved = false;
      pointerId = e.pointerId;
      startY = e.clientY;
      startTop = list.scrollTop;
      list.classList.add("dragging");
      try {
        list.setPointerCapture(e.pointerId);
      } catch (_) {}
    });

    list.addEventListener("pointermove", (e) => {
      if (!dragging || e.pointerId !== pointerId) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 4) moved = true;
      list.scrollTop = startTop - dy;
      if (moved) e.preventDefault();
    });

    const endDrag = (e) => {
      if (!dragging || (e && e.pointerId !== pointerId)) return;
      dragging = false;
      pointerId = null;
      list.classList.remove("dragging");
      if (moved) {
        list.dataset.dragMoved = "1";
        setTimeout(() => {
          delete list.dataset.dragMoved;
        }, 0);
      }
      moved = false;
    };

    list.addEventListener("pointerup", endDrag);
    list.addEventListener("pointercancel", endDrag);
    list.addEventListener("lostpointercapture", endDrag);
    list.addEventListener(
      "click",
      (e) => {
        if (list.dataset.dragMoved !== "1") return;
        e.preventDefault();
        e.stopPropagation();
        delete list.dataset.dragMoved;
      },
      true
    );
  }

  function wireDragScrollAreas(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(".grade-fx-list").forEach((n) => bindDragScroll(n, { blockWheel: true }));
    scope
      .querySelectorAll(".own-body, .book-grid, .stat-guide-box, .fx ul, .cmp-overlay:not(#opt-loading)")
      .forEach((n) => bindDragScroll(n));
    if (root && root.classList) {
      if (root.classList.contains("grade-fx-list")) bindDragScroll(root, { blockWheel: true });
      if (
        root.classList.contains("own-body") ||
        root.classList.contains("book-grid") ||
        root.classList.contains("stat-guide-box")
      ) {
        bindDragScroll(root);
      }
    }
  }

  function slotCell(def, card, index) {
    const open = def.unlock <= levelOf(state.relic);
    if (!open) {
      return `<div class="bslot g-${def.min} locked">
        <span class="bslot-box">${LOCK_SVG}<span class="blv">Lv.${def.unlock}</span></span>
        <span class="bslot-need">${def.need}</span>
      </div>`;
    }
    const pinned = !!(state.pinned[state.relic] && state.pinned[state.relic][index]);
    const pin = pinned ? `<i class="pin-mark">등록</i>` : "";
    if (card) {
      const enh = enhanceOf(card.grade);
      const enhMark = enh > 0 ? `<i class="enh-mark">${enh}강</i>` : "";
      return `<button type="button" class="bslot g-${def.min} open filled${pinned ? " is-pin" : ""}" data-ex="${escapeAttr(
        card.name
      )}" data-slot="${index}" title="클릭해서 등록 또는 제외">
        <span class="bslot-box"><img src="${portraitSrc(card.name)}" alt="" onerror="this.style.visibility='hidden'">${pin}</span>
        <span class="bslot-need">${enhMark}<span class="bslot-name">${escapeHtml(card.name)}</span></span>
      </button>`;
    }
    return `<button type="button" class="bslot g-${def.min} open empty" data-reg-slot="${index}" title="클릭해서 카드 등록">
      <span class="bslot-box"><span class="plus">+</span></span>
      <span class="bslot-need">${def.need}</span>
    </button>`;
  }

  function renderBoard(opts) {
    const box = el("relic-board");
    if (!box) return;
    const quiet = !!(opts && opts.quiet);
    const cards = cardIndex();
    const names = lastCapture ? lastCapture.names : [];
    const placed = assignSlots(names, cards);
    const cluster = (ids) => ids.map((i) => slotCell(SLOT_DEFS[i], placed[i].card, i)).join("");
    syncCurrentLevel();
    if (
      quiet &&
      box.dataset.boardRelic === state.relic &&
      box.dataset.level === String(levelOf(state.relic)) &&
      box.querySelector(".cluster.rare-l")
    ) {
      const map = [
        [".cluster.rare-l", [0, 1, 2, 3]],
        [".cluster.rare-r", [4, 5, 6, 7]],
        [".cluster.hero-l", [8, 9, 10]],
        [".cluster.legend", [14]],
        [".cluster.hero-r", [11, 12, 13]],
      ];
      for (const [sel, ids] of map) {
        const node = box.querySelector(sel);
        if (node) node.innerHTML = cluster(ids);
      }
      box.querySelectorAll("[data-mode]").forEach((btn) => {
        btn.classList.toggle("on", btn.dataset.mode === state.mode);
      });
      return;
    }
    const curLv = levelOf(state.relic);
    const lvIdx = RELIC_LEVELS.indexOf(curLv);
    const lvMin = lvIdx <= 0;
    const lvMax = lvIdx >= RELIC_LEVELS.length - 1;
    const chevL =
      '<svg viewBox="0 0 14 20" aria-hidden="true"><path d="M12.2 1.4 L1.6 10 l10.6 8.6 Z" fill="currentColor"/></svg>';
    const chevR =
      '<svg viewBox="0 0 14 20" aria-hidden="true"><path d="M1.8 1.4 L12.4 10 1.8 18.6 Z" fill="currentColor"/></svg>';
    const modes = ["PVE", "PVP"]
      .map((m) => `<button type="button" class="enh ${state.mode === m ? "on" : ""}" data-mode="${m}">${m}</button>`)
      .join("");
    const picks = ["초월", "외형", "황금", "경험"]
      .map((r) => {
        const on = !!state.relicEnabled[r];
        const viewing = r === state.relic;
        return `<button type="button" class="relic${on ? " on has-deck" : ""}${viewing ? " viewing" : ""}" data-relic="${r}" aria-pressed="${on ? "true" : "false"}" aria-current="${viewing ? "true" : "false"}" title="${viewing ? "현재 보고 있는 성물" : r + "의 성물"}">${r}의 성물</button>`;
      })
      .join("");
    box.dataset.boardRelic = state.relic;
    box.dataset.level = String(curLv);
    box.innerHTML = `
      <img class="board-bg" src="성물/${encodeURIComponent(state.relic)}-bg.jpg?v=70" alt="">
      <div class="board-veil" aria-hidden="true"></div>
      <div class="board-sets">
        <button type="button" class="set-btn${state.saved[0] ? " on" : ""}" id="set-a" data-set-slot="0" aria-pressed="${state.saved[0] ? "true" : "false"}">A SET 저장</button>
        <button type="button" class="set-btn${state.saved[1] ? " on" : ""}" id="set-b" data-set-slot="1" aria-pressed="${state.saved[1] ? "true" : "false"}">B SET 저장</button>
        <p class="board-set-note">※ A 와 B 전부 저장하면 비교창이 뜹니다</p>
      </div>
      <div class="board-modes">${modes}</div>
      <div class="board-ui">
        <div class="board-title">
          <small>${state.relic}의 성물</small>
          <div class="lv-step" role="group" aria-label="성물 레벨">
            <i class="lv-rule" aria-hidden="true"></i>
            <button type="button" class="lv-arr" data-lv-step="-1" aria-label="레벨 내리기"${lvMin ? " disabled" : ""}>${chevL}</button>
            <b class="lv-num">Lv.${curLv}</b>
            <button type="button" class="lv-arr" data-lv-step="1" aria-label="레벨 올리기"${lvMax ? " disabled" : ""}>${chevR}</button>
            <i class="lv-rule" aria-hidden="true"></i>
          </div>
        </div>
        <div class="board-picks">
          <div class="board-pick-btns">${picks}</div>
          <p class="board-pick-note">※ 각 성물이 선택 된 상태에서 한번더 누르면 해당 성물의 모든 카드들이 일괄 해제 됩니다.</p>
        </div>
        <div class="cluster rare-l">${cluster([0, 1, 2, 3])}</div>
        <div class="board-art-space" aria-hidden="true">
          <img class="board-art" src="성물/${encodeURIComponent(state.relic)}-art.png?v=70" alt="">
        </div>
        <div class="cluster rare-r">${cluster([4, 5, 6, 7])}</div>
        <div class="cluster hero-l">${cluster([8, 9, 10])}</div>
        <div class="cluster legend">${cluster([14])}</div>
        <div class="cluster hero-r">${cluster([11, 12, 13])}</div>
      </div>
      <p class="board-note">※ 카드를 누르면 등록하거나 제외할 수 있습니다.<br>※ 보유 카드는 상단 등급 버튼에서 선택하고, 그 카드들로 최적 덱을 찾습니다.</p>
      <div class="board-actions">
        <button type="button" class="ghost" data-stat-guide>추천 스탯 우선순위</button>
        <button type="button" class="ghost board-deck-export" data-deck-export>📥 결속 목록 내려받기</button>
      </div>
    `;
  }

  function ptsLine(pts) {
    return BIND_DATA.grades
      .filter((g) => pts[g])
      .map((g) => `${g} +${pts[g]}`)
      .join("  ");
  }

  function compactName(name) {
    return String(name).replace(/[\s'’·]/g, "");
  }

  function portraitSrc(name) {
    return "초상화/" + encodeURIComponent(compactName(name)) + ".png?v=49";
  }

  function chipInner(name, extra) {
    return `<img src="${portraitSrc(name)}" alt="" width="48" height="48" onerror="this.style.visibility='hidden'"><span class="txt">${extra}</span>`;
  }

  function recChip(name, cards, extra, slot) {
    const c = cards.get(name);
    const slotAttr = slot != null ? ` data-slot="${slot}"` : "";
    return `<button type="button" class="card-chip g-${c.rank}" data-ex="${escapeAttr(
      name
    )}"${slotAttr} title="클릭해서 등록 또는 제외">${chipInner(name, extra)}</button>`;
  }

  function pairRole(name, inPair, recSet) {
    if (!recSet.has(name)) return "";
    const size = inPair.get(name);
    if (size === 3) return `<em class="tag t-3">3장</em>`;
    if (size === 2) return `<em class="tag t-2">2장</em>`;
    return `<em class="tag">한장</em>`;
  }

  function groupRecommended(ev) {
    const pairLines = ev.lines
      .filter((l) => l.kind === "페어")
      .slice()
      .sort((a, b) => b.size - a.size || b.enhance - a.enhance || a.grade.localeCompare(b.grade, "ko"));
    const inPair = new Map();
    for (const l of pairLines) {
      for (const n of l.cards) inPair.set(n, Math.max(inPair.get(n) || 0, l.size));
    }
    const singles = ev.names.filter((n) => !inPair.has(n));
    return { pairLines, inPair, singles };
  }

  function clearRelicDecks() {
    for (const r of RELIC_ORDER) {
      state.relicDecks[r] = null;
      lastEvByRelic[r] = null;
    }
    lastCapture = null;
    dirtyStart = 0;
  }

  function refreshRelicDecks() {
    syncCurrentLevel();
    if (!state.slots || !selectedGrades().length) {
      clearRelicDecks();
      return null;
    }
    let currentEv = null;
    for (let i = 0; i < RELIC_ORDER.length; i++) {
      const r = RELIC_ORDER[i];
      if (!state.relicEnabled[r]) {
        state.relicDecks[r] = null;
        lastEvByRelic[r] = null;
        continue;
      }
      if (i < dirtyStart && lastEvByRelic[r]) {
        if (r === state.relic) currentEv = lastEvByRelic[r];
        continue;
      }
      const ev = optimize(r);
      lastEvByRelic[r] = ev;
      state.relicDecks[r] = ev ? captureFrom(ev, r) : null;
      if (r === state.relic) currentEv = ev;
    }
    dirtyStart = RELIC_ORDER.length;
    lastCapture = state.relicDecks[state.relic];
    return currentEv;
  }

  function needsOptimizeWork() {
    if (!state.slots || !selectedGrades().length) return false;
    for (let i = dirtyStart; i < RELIC_ORDER.length; i++) {
      if (state.relicEnabled[RELIC_ORDER[i]]) return true;
    }
    return false;
  }

  function yieldToUi() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    });
  }

  let optDotTimer = null;
  let drawSeq = 0;
  let optLoadToken = 0;

  function showOptLoading() {
    const box = el("opt-loading");
    const dots = el("opt-loading-dots");
    if (!box) return 0;
    const token = ++optLoadToken;
    box.dataset.token = String(token);
    box.classList.add("show");
    let n = 1;
    if (dots) dots.textContent = ".";
    if (optDotTimer) clearInterval(optDotTimer);
    optDotTimer = setInterval(() => {
      n = (n % 3) + 1;
      if (dots) dots.textContent = ".".repeat(n);
    }, 380);
    return token;
  }

  function hideOptLoading(token) {
    const box = el("opt-loading");
    if (!box) return;
    if (token != null && Number(box.dataset.token || 0) !== token) return;
    if (optDotTimer) {
      clearInterval(optDotTimer);
      optDotTimer = null;
    }
    box.classList.remove("show");
    delete box.dataset.token;
  }

  async function refreshRelicDecksAsync() {
    syncCurrentLevel();
    if (!state.slots || !selectedGrades().length) {
      clearRelicDecks();
      return null;
    }
    let currentEv = null;
    for (let i = 0; i < RELIC_ORDER.length; i++) {
      const r = RELIC_ORDER[i];
      if (!state.relicEnabled[r]) {
        state.relicDecks[r] = null;
        lastEvByRelic[r] = null;
        continue;
      }
      if (i < dirtyStart && lastEvByRelic[r]) {
        if (r === state.relic) currentEv = lastEvByRelic[r];
        continue;
      }
      await yieldToUi();
      const ev = optimize(r);
      lastEvByRelic[r] = ev;
      state.relicDecks[r] = ev ? captureFrom(ev, r) : null;
      if (r === state.relic) currentEv = ev;
    }
    dirtyStart = RELIC_ORDER.length;
    lastCapture = state.relicDecks[state.relic];
    return currentEv;
  }

  function renderResult(ev) {
    const box = el("result");
    const want = selectedGrades();
    if (!state.slots && !want.length) {
      clearRelicDecks();
      box.innerHTML = `<p class="empty">성물 레벨과 사용할 등급을 선택하세요.</p>`;
      return;
    }
    if (!state.slots) {
      clearRelicDecks();
      box.innerHTML = `<p class="empty">성물 레벨을 선택하세요.</p>`;
      return;
    }
    if (!want.length) {
      clearRelicDecks();
      box.innerHTML = `<p class="empty">등급을 하나 이상 선택하세요.</p>`;
      return;
    }
    if (ev === undefined) ev = refreshRelicDecks();
    if (!state.relicEnabled[state.relic]) {
      lastCapture = null;
      box.innerHTML = `<p class="empty">${state.relic}의 성물이 꺼져 있습니다. 버튼을 다시 누르면 결속이 적용됩니다.</p>`;
      return;
    }
    if (!ev) {
      lastCapture = null;
      box.innerHTML = `<p class="empty">조건을 만족하는 세트가 없습니다.</p>`;
      return;
    }
    const cards = cardIndex();
    const slotOf = new Map();
    assignSlots(ev.names, cards).forEach((s, i) => {
      if (s.card) slotOf.set(s.card.name, i);
    });
    const opened = effectLines(state.relic, ev.pts);
    const pairs = ev.lines.filter((l) => l.kind === "페어");
    const han = ev.lines.filter((l) => l.kind === "한장");
    const unusedSlots = ev.leftover.length;

    const grouped = groupRecommended(ev);
    const recSet = new Set(ev.names);
    const priorUsed = usedByRelicsBefore(state.relic);

    const recChipHtml = (n, needEnh) => {
      const c = cards.get(n);
      return recChip(
        n,
        cards,
        `<em>${c.kind === "무기외형" ? "외형" : "초월"}</em><strong>${escapeHtml(n)}</strong><span>${c.grade} · ${
          needEnh
        }강</span>`,
        slotOf.get(n)
      );
    };

    const pairGroupsHtml = grouped.pairLines
      .map((l) => {
        const chips = l.cards
          .map((n, i) => (i ? `<span class="pair-plus">+</span>${recChipHtml(n, l.enhance)}` : recChipHtml(n, l.enhance)))
          .join("");
        return `<div class="set-group size-${l.size}">
          <div class="set-head"><span>${l.size}장 페어</span><i>${l.grade} · ${l.enhance}강 · ${ptsLine(l.pts)}</i></div>
          <div class="pair-row">${chips}</div>
        </div>`;
      })
      .join("");

    const singleHtml = grouped.singles.length
      ? `<div class="set-group size-1">
          <div class="set-head"><span>한장</span><i>${grouped.singles.length}장 · 페어에 안 묶인 칸 · 0강</i></div>
          <div class="chips">${grouped.singles.map((n) => recChipHtml(n, 0)).join("")}</div>
        </div>`
      : "";

    const setHtml = `<div class="set-groups">${pairGroupsHtml}${singleHtml}</div>`;

    const pairHtml = pairs.length
      ? pairs
          .map(
            (l) =>
              `<li><b>${l.grade} ${l.size}장 ${l.enhance}강</b> ${l.cards.map(escapeHtml).join(" · ")} <i>${ptsLine(
                l.pts
              )}</i></li>`
          )
          .join("")
      : "<li class='mute'>켜진 페어 없음</li>";

    const fxHtml = want
      .map((g) => {
        const rows = opened[g];
        const last = rows.length ? rows[rows.length - 1].at : 0;
        const list = rows.length
          ? rows
              .map((e) => {
                const t = tierOfStat(effectStatName(e.text));
                const tag = t ? `<i class="tier">${t}티어</i>` : "";
                return `<li class="${t ? "t-" + t : ""}"><b>${e.at}</b> ${escapeHtml(e.text)}${tag}</li>`;
              })
              .join("")
          : "<li class='mute'>아직 구간 없음</li>";
        return `<div class="fx"><h3>${g} ${ev.pts[g]}p${last ? ` · ${last} 구간까지` : ""} · ${state.mode}</h3><ul>${list}</ul></div>`;
      })
      .join("");

    const exNames = [...state.excluded].sort((a, b) => {
      const ra = (cards.get(a) || {}).rank || 99;
      const rb = (cards.get(b) || {}).rank || 99;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b, "ko");
    });
    const exBar = exNames.length
      ? `<div class="ex-bar" aria-label="제외한 카드">${exNames
          .map((n) => {
            const c = cards.get(n);
            const g = c ? ` g-${c.rank}` : "";
            return `<button type="button" class="ex-face${g}" data-in="${escapeAttr(n)}" title="${escapeAttr(
              n
            )} · 다시 넣기" aria-label="${escapeAttr(n)} 다시 넣기"><img src="${portraitSrc(
              n
            )}" alt="" onerror="this.style.visibility='hidden'"></button>`;
          })
          .join("")}</div>`
      : `<div class="ex-bar is-empty">제외한 카드가 없습니다</div>`;

    const recNames = ev.names.slice();
    const equipHtml = `<div class="equip-list">
      <h3>이 카드를 슬롯에 장착해 주세요.</h3>
      <div class="chips">${
        recNames.length
          ? recNames
              .map((n) => {
                const c = cards.get(n);
                const rank = c ? c.rank : 1;
                return `<button type="button" class="card-chip g-${rank}" data-ex="${escapeAttr(n)}"${
                  slotOf.has(n) ? ` data-slot="${slotOf.get(n)}"` : ""
                } title="${escapeAttr(n)}">${chipInner(n, `<strong>${escapeHtml(n)}</strong>`)}</button>`;
              })
              .join("")
          : `<p class="mute">추천 카드가 없습니다</p>`
      }</div>
    </div>`;

    box.innerHTML = `
      ${equipHtml}
      ${exBar}
      <p class="hint">${state.mode} 모드 · ${state.relic}의 성물 · 1티어 스탯이 먼저 켜지는 조합 · 추천 ${ev.names.length}장${
        unusedSlots ? ` · 빈 칸 ${unusedSlots}` : ""
      }${priorUsed.size ? ` · 이전 성물 ${priorUsed.size}장 제외` : ""} · ${grouped.pairLines.filter((l) => l.size === 3).length}개 3장 · ${
        grouped.pairLines.filter((l) => l.size === 2).length
      }개 2장 · 한장 ${grouped.singles.length} · 보유 카드는 상단 등급 버튼에서 선택합니다.</p>
      ${setHtml}
      <div class="cols">
        <div>
          <h3>결속조합 ${pairs.length}</h3>
          <ul class="lines">${pairHtml}</ul>
          <p class="mute">한장 ${han.length}줄도 함께 켜집니다.</p>
        </div>
        <div class="fx-wrap">${fxHtml}</div>
      </div>
    `;
    wireDragScrollAreas(box);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function bind() {
    el("grades").addEventListener("click", (e) => {
      const gbtn = e.target.closest("[data-grade]");
      if (gbtn) {
        const g = gbtn.dataset.grade;
        const turningOn = !state.grades[g];
        if (turningOn) {
          state.grades[g] = true;
          markDirtyFrom(null);
          requestQuietDraw();
          openCardOwn(g);
        } else {
          openCardOwn(g);
        }
        return;
      }
      const b = e.target.closest("[data-g-enh]");
      if (!b) return;
      e.preventDefault();
      if (!state.gradeEnhance) state.gradeEnhance = {};
      state.gradeEnhance[b.dataset.gEnh] = Number(b.dataset.n);
      markDirtyFrom(null);
      draw();
    });
    const fxToggle = el("grade-fx-toggle");
    if (fxToggle) {
      fxToggle.addEventListener("click", () => {
        gradeFxOpen = !gradeFxOpen;
        renderGradeFx();
      });
    }
    const saveNotice = el("save-notice");
    if (saveNotice) {
      el("save-notice-ok-btn").addEventListener("click", () => {
        tapSetBtn(el("save-notice-ok-btn"));
        closeSaveNotice();
      });
      const copyBtn = el("prefs-copy-code");
      if (copyBtn) copyBtn.addEventListener("click", () => copyExportCode());
      saveNotice.addEventListener("click", (e) => {
        if (e.target === saveNotice) closeSaveNotice();
      });
    }
    const exportBtn = el("prefs-export");
    if (exportBtn) exportBtn.addEventListener("click", openExportPopup);
    const importOpen = el("prefs-import-open");
    if (importOpen) importOpen.addEventListener("click", openImportPopup);
    const importBox = el("prefs-import");
    if (importBox) {
      el("prefs-import-apply").addEventListener("click", importPrefsFromInput);
      el("prefs-import-cancel").addEventListener("click", closeImportPopup);
      importBox.addEventListener("click", (e) => {
        if (e.target === importBox) closeImportPopup();
      });
    }
    const importDone = el("prefs-import-done");
    if (importDone) {
      el("prefs-import-done-ok").addEventListener("click", closeImportDone);
      importDone.addEventListener("click", (e) => {
        if (e.target === importDone) closeImportDone();
      });
    }
    const deckExport = el("deck-export");
    if (deckExport) {
      el("deck-export-copy").addEventListener("click", () => copyDeckExport());
      el("deck-export-download").addEventListener("click", () => downloadDeckExport());
      el("deck-export-close").addEventListener("click", () => {
        tapSetBtn(el("deck-export-close"));
        closeDeckExport();
      });
      deckExport.addEventListener("click", (e) => {
        if (e.target === deckExport) closeDeckExport();
      });
    }
    const statGuide = el("stat-guide");
    if (statGuide) {
      el("stat-guide-custom").addEventListener("click", () => {
        tapSetBtn(el("stat-guide-custom"));
        openStatGuideSoon();
      });
      el("stat-guide-close").addEventListener("click", () => {
        tapSetBtn(el("stat-guide-close"));
        closeStatGuide();
      });
      statGuide.addEventListener("click", (e) => {
        if (e.target === statGuide) closeStatGuide();
      });
    }
    const statGuideSoon = el("stat-guide-soon");
    if (statGuideSoon) {
      el("stat-guide-soon-ok").addEventListener("click", () => {
        tapSetBtn(el("stat-guide-soon-ok"));
        closeStatGuideSoon();
      });
      statGuideSoon.addEventListener("click", (e) => {
        if (e.target === statGuideSoon) closeStatGuideSoon();
      });
    }
    el("relic-board").addEventListener("click", (e) => {
      if (e.target.closest("[data-stat-guide]")) {
        openStatGuide();
        return;
      }
      if (e.target.closest("[data-deck-export]")) {
        openDeckExport();
        return;
      }
      if (e.target.closest("[data-set-slot]")) {
        const slot = e.target.closest("[data-set-slot]");
        e.preventDefault();
        e.stopPropagation();
        if (e.detail > 1) return;
        toggleSave(Number(slot.dataset.setSlot));
        return;
      }
      const step = e.target.closest("[data-lv-step]");
      if (step) {
        if (step.disabled) return;
        stepRelicLevel(Number(step.dataset.lvStep));
        markDirtyFrom(state.relic);
        draw();
        return;
      }
      const mode = e.target.closest(".board-modes [data-mode]");
      if (mode) {
        e.preventDefault();
        e.stopPropagation();
        const next = mode.dataset.mode;
        if (next !== "PVE" && next !== "PVP") return;
        if (state.mode === next) return;
        state.mode = next;
        markDirtyFrom(null);
        draw();
        return;
      }
      const relic = e.target.closest(".board-picks [data-relic]");
      if (relic) {
        if (e.detail > 1) return;
        const r = relic.dataset.relic;
        if (state.relic === r && state.relicEnabled[r]) {
          state.relicEnabled[r] = false;
          state.pinned[r] = SLOT_DEFS.map(() => null);
          markDirtyFrom(r);
        } else {
          const wasOn = !!state.relicEnabled[r];
          state.relicEnabled[r] = true;
          state.relic = r;
          syncCurrentLevel();
          if (!wasOn) markDirtyFrom(r);
        }
        draw();
        return;
      }
      const empty = e.target.closest("[data-reg-slot]");
      if (empty) {
        openCardBookForSlot(Number(empty.dataset.regSlot));
        return;
      }
      const out = e.target.closest("[data-ex]");
      if (out) {
        openCardChoice(out.dataset.ex, out.dataset.slot);
      }
    });
    el("result").addEventListener("click", (e) => {
      const out = e.target.closest("[data-ex]");
      if (out) {
        excludeCard(out.dataset.ex);
        return;
      }
      const back = e.target.closest("[data-in]");
      if (back) {
        includeCard(back.dataset.in);
      }
    });
    el("cmp-close").addEventListener("click", closeCompare);
    el("cmp-overlay").addEventListener("click", (e) => {
      if (e.target === el("cmp-overlay")) closeCompare();
    });
    el("set-prompt-cmp-cur").addEventListener("click", () => {
      tapSetBtn(el("set-prompt-cmp-cur"));
      closeSetPrompt();
      openCompareCurrent();
    });
    el("set-prompt-cmp-all").addEventListener("click", () => {
      tapSetBtn(el("set-prompt-cmp-all"));
      closeSetPrompt();
      openCompareAll();
    });
    el("set-prompt-cancel").addEventListener("click", () => {
      tapSetBtn(el("set-prompt-cancel"));
      clearSavedSets();
    });
    el("card-choice-reg").addEventListener("click", () => {
      tapSetBtn(el("card-choice-reg"));
      openCardBook();
    });
    el("card-choice-ex").addEventListener("click", () => {
      tapSetBtn(el("card-choice-ex"));
      excludeCard(choiceName);
    });
    el("card-choice-cancel").addEventListener("click", () => {
      tapSetBtn(el("card-choice-cancel"));
      closeCardChoice();
    });
    el("card-choice").addEventListener("click", (e) => {
      if (e.target === el("card-choice")) closeCardChoice();
    });
    el("card-book-close").addEventListener("click", closeCardBook);
    el("card-book").addEventListener("click", (e) => {
      if (e.target === el("card-book")) closeCardBook();
    });
    el("card-book-tabs").addEventListener("click", (e) => {
      const tab = e.target.closest("[data-book-grade]");
      if (!tab) return;
      bookGrade = tab.dataset.bookGrade;
      renderCardBook();
    });
    el("card-book-grid").addEventListener("click", (e) => {
      const pick = e.target.closest("[data-book-pick]");
      if (!pick) return;
      registerCard(pick.dataset.bookPick);
    });
    const ownBox = el("card-own");
    if (ownBox) {
      el("card-own-close").addEventListener("click", () => closeCardOwn(true));
      el("card-own-done").addEventListener("click", finishCardOwnAndSave);
      el("card-own-disable").addEventListener("click", disableOwnGrade);
      el("card-own-all-on").addEventListener("click", () => setOwnGradeAll(true));
      el("card-own-all-off").addEventListener("click", () => setOwnGradeAll(false));
      ownBox.addEventListener("click", (e) => {
        if (e.target === ownBox) closeCardOwn(true);
      });
      el("card-own-body").addEventListener("click", (e) => {
        const card = e.target.closest("[data-own-toggle]");
        if (!card) return;
        toggleOwnCard(card.dataset.ownToggle);
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (el("prefs-import-done") && el("prefs-import-done").classList.contains("show")) {
        closeImportDone();
        return;
      }
      if (el("prefs-import") && el("prefs-import").classList.contains("show")) {
        closeImportPopup();
        return;
      }
      if (el("stat-guide-soon") && el("stat-guide-soon").classList.contains("show")) {
        closeStatGuideSoon();
        return;
      }
      if (el("stat-guide") && el("stat-guide").classList.contains("show")) {
        closeStatGuide();
        return;
      }
      if (el("deck-export") && el("deck-export").classList.contains("show")) {
        closeDeckExport();
        return;
      }
      if (el("save-notice") && el("save-notice").classList.contains("show")) {
        closeSaveNotice();
        return;
      }
      if (el("card-own") && el("card-own").classList.contains("show")) {
        closeCardOwn(true);
        return;
      }
      if (el("card-book").classList.contains("show")) {
        closeCardBook();
        return;
      }
      if (el("card-choice").classList.contains("show")) {
        closeCardChoice();
        return;
      }
      if (el("cmp-overlay").classList.contains("show")) closeCompare();
    });
    wireDragScrollAreas();
  }

  async function draw(opts) {
    const quiet = !!(opts && opts.quiet);
    if (!quiet && quietDrawTimer) {
      clearTimeout(quietDrawTimer);
      quietDrawTimer = null;
    }
    const seq = ++drawSeq;
    let loadToken = null;
    try {
      if (needsOptimizeWork()) {
        if (quiet) {
          // 제외/포함은 로딩 팝업·프레임 양보 없이 동기 갱신해 깜빡임을 줄임
          const ev = refreshRelicDecks();
          if (seq !== drawSeq) return;
          renderResult(ev);
        } else {
          loadToken = showOptLoading();
          await yieldToUi();
          if (seq !== drawSeq) return;
          const ev = await refreshRelicDecksAsync();
          if (seq !== drawSeq) return;
          renderResult(ev);
        }
      } else {
        renderResult(refreshRelicDecks());
      }
      if (seq !== drawSeq) return;
      renderControls(quiet ? { quiet: true } : null);
      renderBoard(quiet ? { quiet: true } : null);
      renderSaveBar();
      restoreScroll();
      scheduleSave();
    } finally {
      if (loadToken != null) hideOptLoading(loadToken);
    }
  }

  window.BIND_APP = { state, optimize, slotBreakdown, selectedGrades, effectValue, setEnhanceAll, enhanceOf, setRelicLevel, slotsFromLevel, usedByRelicsBefore, refreshRelicDecks, markDirtyFrom, relicUsingCard };

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      const restored = loadPrefs();
      bind();
      draw();
      if (restored) {
        const note = el("grade-note-load");
        if (note) {
          note.hidden = false;
          note.textContent = "저장된 내 카드를 불러왔습니다.";
        }
      }
    });
  }
})();
