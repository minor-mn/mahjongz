(() => {
  "use strict";

  const HAND_SIZE = 13;
  const DRAW_HAND_SIZE = 14;
  const EV_MAX_SHANTEN = 3;
  const EV_MAX_DRAWS = 12;
  const EV_BRANCH_LIMIT = 3;
  const EV_VALUE_DETOUR_LIMIT = 0;
  const EV_DRAW_IMPROVING_LIMIT = 10;
  const EV_DRAW_SAME_LIMIT = 10;
  const EV_DRAW_DETOUR_LIMIT = 0;
  const EV_VALUE_GAIN_THRESHOLD = 0;
  const EV_WINNING_LIMIT = 12;

  const INPUT_MODES = {
    hand: "手牌",
    open: "副露",
    closedKan: "暗槓",
    dora: "ドラ表示牌",
  };

  const RED_TILE_IMAGES = {
    4: "images/manzu1/p_msa_1.gif",
    13: "images/pinzu1/p_psa_1.gif",
    22: "images/sozu1/p_ssa_1.gif",
  };
  const RED_TILE_INDICES = new Set(Object.keys(RED_TILE_IMAGES).map(Number));

  const TILE_DEFS = [
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `${i + 1}m`,
      short: `${i + 1}萬`,
      name: `${i + 1}萬`,
      group: "萬子",
      image: `images/manzu1/p_ms${i + 1}_1.gif`,
    })),
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `${i + 1}p`,
      short: `${i + 1}筒`,
      name: `${i + 1}筒`,
      group: "筒子",
      image: `images/pinzu1/p_ps${i + 1}_1.gif`,
    })),
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `${i + 1}s`,
      short: `${i + 1}索`,
      name: `${i + 1}索`,
      group: "索子",
      image: `images/sozu1/p_ss${i + 1}_1.gif`,
    })),
    { id: "1z", short: "東", name: "東", group: "字牌", image: "images/tupai_1/p_ji_e_1.gif" },
    { id: "2z", short: "南", name: "南", group: "字牌", image: "images/tupai_1/p_ji_s_1.gif" },
    { id: "3z", short: "西", name: "西", group: "字牌", image: "images/tupai_1/p_ji_w_1.gif" },
    { id: "4z", short: "北", name: "北", group: "字牌", image: "images/tupai_1/p_ji_n_1.gif" },
    { id: "5z", short: "白", name: "白", group: "字牌", image: "images/tupai_1/p_no_1.gif" },
    { id: "6z", short: "發", name: "發", group: "字牌", image: "images/tupai_1/p_ji_h_1.gif" },
    { id: "7z", short: "中", name: "中", group: "字牌", image: "images/tupai_1/p_ji_c_1.gif" },
  ];

  const GROUPS = [
    { name: "萬子", start: 0, end: 8 },
    { name: "筒子", start: 9, end: 17 },
    { name: "索子", start: 18, end: 26 },
    { name: "字牌", start: 27, end: 33 },
  ];

  const WINDS = new Set([27, 28, 29, 30]);
  const DRAGONS = new Set([31, 32, 33]);
  const TERMINALS_AND_HONORS = new Set([
    0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33,
  ]);
  const GREEN_TILES = new Set([19, 20, 21, 23, 25, 32]);

  const SAMPLE_GENERATION_ATTEMPTS = 1200;

  const state = {
    counts: Array(34).fill(0),
    redCounts: Array(34).fill(0),
    inputMode: "hand",
    openMelds: [],
    closedKans: [],
    doraIndicators: [],
    openDraft: [],
    openDraftRed: [],
    closedKanDraft: [],
    settings: {
      roundWind: 27,
      seatWind: 28,
      riichi: false,
    },
  };

  let resultRenderToken = 0;
  let acceptanceDetailLayer = null;

  function totalTiles(counts) {
    return counts.reduce((sum, count) => sum + count, 0);
  }

  function cloneCounts(counts) {
    return counts.slice();
  }

  function shuffled(values) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function randomChoice(values) {
    return values[Math.floor(Math.random() * values.length)];
  }

  function sequenceTiles(suit, base) {
    const offset = suit * 9;
    return [offset + base, offset + base + 1, offset + base + 2];
  }

  function addTilesToCountsSafely(counts, tiles) {
    for (const tile of tiles) {
      if (counts[tile] >= 4) return false;
    }
    for (const tile of tiles) counts[tile] += 1;
    return true;
  }

  function sequenceSupport(counts, suit, base) {
    const [first, middle, last] = sequenceTiles(suit, base);
    const complete = counts[first] > 0 && counts[middle] > 0 && counts[last] > 0;
    const partial = (
      (counts[first] > 0 && counts[middle] > 0)
      || (counts[middle] > 0 && counts[last] > 0)
      || (counts[first] > 0 && counts[last] > 0)
    );
    return { complete, partial };
  }

  function sanshokuPotentials(counts) {
    const potentials = [];

    for (let base = 0; base <= 6; base += 1) {
      const supports = [0, 1, 2].map((suit) => sequenceSupport(counts, suit, base));
      const supportCount = supports.filter((support) => support.partial).length;
      const completeCount = supports.filter((support) => support.complete).length;
      if (supportCount === 3 && completeCount < 3) {
        potentials.push({ base, completeCount });
      }
    }

    return potentials;
  }

  function canAdvanceFromDiscard(counts) {
    for (let discard = 0; discard < 34; discard += 1) {
      if (!counts[discard]) continue;

      const afterDiscard = cloneCounts(counts);
      afterDiscard[discard] -= 1;
      const afterDiscardInfo = minShanten(afterDiscard);
      if (afterDiscardInfo.values.normal !== 2) continue;

      for (let draw = 0; draw < 34; draw += 1) {
        if (afterDiscard[draw] >= 4) continue;
        const afterDraw = addTile(afterDiscard, draw);
        if (minShanten(afterDraw).values.normal === 1) return true;
      }
    }

    return false;
  }

  function generateSanshokuExample() {
    const fallback = parseNotation("123m12p12s99m45m7m5p8s");

    for (let attempt = 0; attempt < SAMPLE_GENERATION_ATTEMPTS; attempt += 1) {
      const counts = Array(34).fill(0);
      const base = Math.floor(Math.random() * 7);
      const suits = shuffled([0, 1, 2]);
      const supportTiles = new Set();

      if (!addTilesToCountsSafely(counts, sequenceTiles(suits[0], base))) continue;
      sequenceTiles(suits[0], base).forEach((tile) => supportTiles.add(tile));

      for (const suit of suits.slice(1)) {
        const shape = randomChoice([
          [base, base + 1],
          [base + 1, base + 2],
          [base, base + 2],
        ]);
        const tiles = shape.map((number) => suit * 9 + number);
        if (!addTilesToCountsSafely(counts, tiles)) continue;
        tiles.forEach((tile) => supportTiles.add(tile));
      }

      const pairCandidates = shuffled(
        Array.from({ length: 27 }, (_, index) => index)
          .filter((tile) => !supportTiles.has(tile) && counts[tile] <= 2),
      );
      const pair = pairCandidates.find((tile) => counts[tile] <= 2);
      if (pair === undefined || !addTilesToCountsSafely(counts, [pair, pair])) continue;

      const fillerCandidates = shuffled(
        Array.from({ length: 27 }, (_, tile) => tile)
          .filter((tile) => counts[tile] === 0 && !supportTiles.has(tile) && tile !== pair),
      );
      for (const tile of fillerCandidates) {
        if (totalTiles(counts) >= 14) break;
        counts[tile] += 1;
      }
      if (totalTiles(counts) !== 14) continue;

      const info = minShanten(counts);
      if (
        info.shanten === 2
        && info.values.normal === 2
        && sanshokuPotentials(counts).length > 0
        && canAdvanceFromDiscard(counts)
      ) {
        return counts;
      }
    }

    return fallback;
  }

  function ceil100(value) {
    return Math.ceil(value / 100) * 100;
  }

  function tileSuit(index) {
    if (index < 9) return "m";
    if (index < 18) return "p";
    if (index < 27) return "s";
    return "z";
  }

  function tileNumber(index) {
    return index % 9 + 1;
  }

  function isRedTileIndex(index) {
    return RED_TILE_INDICES.has(index);
  }

  function tileDefinition(index, red = false) {
    const tile = TILE_DEFS[index];
    if (!red || !isRedTileIndex(index)) return tile;

    return {
      ...tile,
      id: `0${tile.id.slice(1)}`,
      short: `赤${tile.short}`,
      name: `赤${tile.name}`,
      image: RED_TILE_IMAGES[index],
    };
  }

  function doraTileFromIndicator(indicator) {
    if (indicator < 27) {
      const offset = indicator - (indicator % 9);
      return offset + ((indicator % 9 + 1) % 9);
    }

    if (indicator >= 27 && indicator <= 30) {
      return indicator === 30 ? 27 : indicator + 1;
    }

    if (indicator >= 31 && indicator <= 33) {
      return indicator === 33 ? 31 : indicator + 1;
    }

    return indicator;
  }

  function doraBreakdownForCounts(counts, context) {
    const indicatorDora = Array.isArray(context.doraIndicators)
      ? context.doraIndicators.reduce((total, indicator) => (
        total + (counts[doraTileFromIndicator(indicator)] || 0)
      ), 0)
      : Math.max(0, Math.min(12, Math.trunc(Number(context.dora) || 0)));
    const redDora = RED_TILE_INDICES.size > 0 && Array.isArray(context.redCounts)
      ? [...RED_TILE_INDICES].reduce((total, index) => (
        total + Math.min(counts[index] || 0, context.redCounts[index] || 0)
      ), 0)
      : 0;

    return { indicatorDora, redDora, total: indicatorDora + redDora };
  }

  function doraCountForCounts(counts, context) {
    return doraBreakdownForCounts(counts, context).total;
  }

  function isSuitTile(index) {
    return index >= 0 && index < 27;
  }

  function isHonor(index) {
    return index >= 27;
  }

  function isWind(index) {
    return WINDS.has(index);
  }

  function isDragon(index) {
    return DRAGONS.has(index);
  }

  function isTerminal(index) {
    return isSuitTile(index) && (tileNumber(index) === 1 || tileNumber(index) === 9);
  }

  function isTerminalOrHonor(index) {
    return TERMINALS_AND_HONORS.has(index);
  }

  function isSimple(index) {
    return isSuitTile(index) && tileNumber(index) >= 2 && tileNumber(index) <= 8;
  }

  function canStartSequence(index) {
    return isSuitTile(index) && index % 9 <= 6;
  }

  function canStartTwoSidedTaatsu(index) {
    return isSuitTile(index) && index % 9 <= 7;
  }

  function tileIndexFromSuitDigit(suit, digit) {
    const normalizedDigit = digit === 0 ? 5 : digit;

    if (suit === "m") {
      if (normalizedDigit < 1 || normalizedDigit > 9) return -1;
      return normalizedDigit - 1;
    }

    if (suit === "p") {
      if (normalizedDigit < 1 || normalizedDigit > 9) return -1;
      return 9 + normalizedDigit - 1;
    }

    if (suit === "s") {
      if (normalizedDigit < 1 || normalizedDigit > 9) return -1;
      return 18 + normalizedDigit - 1;
    }

    if (suit === "z") {
      if (digit < 1 || digit > 7) return -1;
      return 27 + digit - 1;
    }

    return -1;
  }

  function normalizeInput(text) {
    return text
      .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      .replace(/[ｍＭ]/g, "m")
      .replace(/[ｐＰ]/g, "p")
      .replace(/[ｓＳ]/g, "s")
      .replace(/[ｚＺ]/g, "z")
      .replace(/　/g, " ");
  }

  function suitFromChar(char) {
    const lower = char.toLowerCase();
    if (lower === "m" || char === "萬" || char === "万") return "m";
    if (lower === "p" || char === "筒" || char === "餅" || char === "饼") return "p";
    if (lower === "s" || char === "索" || char === "條" || char === "条") return "s";
    if (lower === "z" || char === "字") return "z";
    return "";
  }

  function honorIndexFromChar(char) {
    const honorMap = new Map([
      ["東", 27],
      ["东", 27],
      ["南", 28],
      ["西", 29],
      ["北", 30],
      ["白", 31],
      ["發", 32],
      ["発", 32],
      ["中", 33],
    ]);
    return honorMap.has(char) ? honorMap.get(char) : -1;
  }

  function parseNotation(text, { maxTiles = DRAW_HAND_SIZE } = {}) {
    const counts = Array(34).fill(0);
    const normalized = normalizeInput(text);
    const digits = [];

    const flushDigits = (suit, position) => {
      if (!digits.length) {
        throw new Error(`${position}文字目: 数字の後に ${suit} を付けてください。`);
      }

      for (const digit of digits) {
        const index = tileIndexFromSuitDigit(suit, digit);
        if (index < 0) {
          throw new Error(`${digit}${suit} は使えない牌です。`);
        }
        counts[index] += 1;
        if (counts[index] > 4) {
          throw new Error(`${TILE_DEFS[index].name} が5枚以上あります。`);
        }
      }
      digits.length = 0;
    };

    for (let i = 0; i < normalized.length; i += 1) {
      const char = normalized[i];
      if (/[\s,、.。/／|｜_-]/.test(char)) continue;

      if (/[0-9]/.test(char)) {
        digits.push(Number(char));
        continue;
      }

      const suit = suitFromChar(char);
      if (suit) {
        flushDigits(suit, i + 1);
        continue;
      }

      const honorIndex = honorIndexFromChar(char);
      if (honorIndex >= 0) {
        if (digits.length) {
          throw new Error("数字の並びの後は m/p/s/z を付けてください。字牌は 1z〜7z か 東南西北白發中 で入力できます。");
        }
        counts[honorIndex] += 1;
        if (counts[honorIndex] > 4) {
          throw new Error(`${TILE_DEFS[honorIndex].name} が5枚以上あります。`);
        }
        continue;
      }

      throw new Error(`「${char}」は読み取れませんでした。`);
    }

    if (digits.length) {
      throw new Error("数字だけが残っています。例: 123m456p789s のように、数字の後に種類を書いてください。");
    }

    if (totalTiles(counts) > maxTiles) {
      throw new Error(`手牌は${maxTiles}枚までです。`);
    }

    return counts;
  }

  function redCountsFromNotation(text) {
    const redCounts = Array(34).fill(0);
    const normalized = normalizeInput(text);
    const digits = [];

    const flushDigits = (suit) => {
      for (const digit of digits) {
        if (digit !== 0) continue;
        const index = tileIndexFromSuitDigit(suit, digit);
        if (index >= 0 && isRedTileIndex(index)) redCounts[index] += 1;
      }
      digits.length = 0;
    };

    for (const char of normalized) {
      if (/\s|[,、.。/／|｜_-]/.test(char)) continue;
      if (/[0-9]/.test(char)) {
        digits.push(Number(char));
        continue;
      }
      const suit = suitFromChar(char);
      if (suit) flushDigits(suit);
      else if (honorIndexFromChar(char) >= 0) digits.length = 0;
    }

    return redCounts;
  }

  function toNotation(counts, redCounts = []) {
    const parts = [];

    for (const [offset, suit] of [[0, "m"], [9, "p"], [18, "s"]]) {
      let digits = "";
      for (let i = 0; i < 9; i += 1) {
        const index = offset + i;
        const red = Math.min(counts[index], redCounts[index] || 0);
        digits += "0".repeat(red);
        digits += String(i + 1).repeat(counts[index] - red);
      }
      if (digits) parts.push(`${digits}${suit}`);
    }

    let honors = "";
    for (let i = 27; i < 34; i += 1) {
      honors += String(i - 26).repeat(counts[i]);
    }
    if (honors) parts.push(`${honors}z`);

    return parts.join("");
  }

  function addTile(counts, index) {
    const next = cloneCounts(counts);
    next[index] += 1;
    return next;
  }

  function meldStructureSize(meld) {
    return meld ? 3 : 0;
  }

  function fixedMeldCount() {
    return state.openMelds.length + state.closedKans.length;
  }

  function requiredHandSize() {
    return HAND_SIZE - fixedMeldCount() * 3;
  }

  function maximumHandSize() {
    return DRAW_HAND_SIZE - fixedMeldCount() * 3;
  }

  function tileCountsFromTiles(tiles) {
    const counts = Array(34).fill(0);
    for (const tile of tiles) counts[tile] += 1;
    return counts;
  }

  function tilesFromCounts(counts) {
    const tiles = [];
    for (let tile = 0; tile < 34; tile += 1) {
      for (let copy = 0; copy < (counts[tile] || 0); copy += 1) {
        tiles.push(tile);
      }
    }
    return tiles;
  }

  function addTilesToCounts(counts, tiles) {
    for (const tile of tiles) counts[tile] += 1;
  }

  function fixedMelds() {
    return [...state.openMelds, ...state.closedKans];
  }

  function redCountsFromMelds(melds) {
    const counts = Array(34).fill(0);
    for (const meld of melds) {
      for (let i = 0; i < meld.tiles.length; i += 1) {
        if (meld.redTiles?.[i]) counts[meld.tiles[i]] += 1;
      }
    }
    return counts;
  }

  function redCountsFromTiles(tiles, redTiles = []) {
    const counts = Array(34).fill(0);
    for (let i = 0; i < tiles.length; i += 1) {
      if (redTiles[i]) counts[tiles[i]] += 1;
    }
    return counts;
  }

  function allUsedRedCounts({ extraClosedRedCounts = state.redCounts, includeDrafts = true } = {}) {
    const counts = cloneCounts(extraClosedRedCounts);
    const fixedRedCounts = redCountsFromMelds(fixedMelds());
    for (let tile = 0; tile < 34; tile += 1) counts[tile] += fixedRedCounts[tile];
    if (includeDrafts) {
      const draftRedCounts = redCountsFromTiles(state.openDraft, state.openDraftRed);
      for (let tile = 0; tile < 34; tile += 1) counts[tile] += draftRedCounts[tile];
    }
    return counts;
  }

  function allUsedCounts({ includeDrafts = true, extraClosedCounts = state.counts } = {}) {
    const counts = cloneCounts(extraClosedCounts);

    for (const meld of state.openMelds) addTilesToCounts(counts, meld.tiles);
    for (const meld of state.closedKans) addTilesToCounts(counts, meld.tiles);
    addTilesToCounts(counts, state.doraIndicators);
    if (includeDrafts) {
      addTilesToCounts(counts, state.openDraft);
      addTilesToCounts(counts, state.closedKanDraft);
    }

    return counts;
  }

  function validateTileUsage(counts) {
    for (let i = 0; i < 34; i += 1) {
      if (counts[i] > 4) {
        throw new Error(`${TILE_DEFS[i].name} が5枚以上あります。`);
      }
    }
  }

  function validateRedUsage(counts, extraCounts = []) {
    for (const index of RED_TILE_INDICES) {
      if ((counts[index] || 0) + (extraCounts[index] || 0) > 1) {
        throw new Error(`${TILE_DEFS[index].name}の赤牌は1枚までです。`);
      }
    }
  }

  function hasIncompleteDraft() {
    return state.openDraft.length > 0 || state.closedKanDraft.length > 0;
  }

  function isMenzen(context = state.settings) {
    return !context.fixedMelds?.some((meld) => meld.open);
  }

  function meldLabel(meld) {
    if (meld.type === "sequence") return "明順";
    if (meld.type === "triplet") return meld.open ? "明刻" : "暗刻";
    if (meld.type === "kan") return meld.open ? "明槓" : "暗槓";
    return "メンツ";
  }

  function openMeldFromThree(tiles, redTiles = []) {
    const entries = tiles.map((tile, index) => ({ tile, red: Boolean(redTiles[index]) }));
    entries.sort((a, b) => a.tile - b.tile);
    const sorted = entries.map((entry) => entry.tile);
    const sortedRed = entries.map((entry) => entry.red);

    if (sorted[0] === sorted[1] && sorted[1] === sorted[2]) {
      return {
        type: "triplet",
        tile: sorted[0],
        tiles: sorted,
        redTiles: sortedRed,
        open: true,
        concealed: false,
        fixed: true,
      };
    }

    if (
      sorted.every(isSuitTile) &&
      tileSuit(sorted[0]) === tileSuit(sorted[1]) &&
      tileSuit(sorted[1]) === tileSuit(sorted[2]) &&
      sorted[0] + 1 === sorted[1] &&
      sorted[1] + 1 === sorted[2]
    ) {
      return {
        type: "sequence",
        base: sorted[0],
        tiles: sorted,
        redTiles: sortedRed,
        open: true,
        concealed: false,
        fixed: true,
      };
    }

    return null;
  }

  function closedKanFromTile(tile, red = false) {
    return {
      type: "kan",
      tile,
      tiles: [tile, tile, tile, tile],
      redTiles: [Boolean(red), false, false, false],
      open: false,
      concealed: true,
      fixed: true,
    };
  }

  function openKanFromTile(tile, red = false) {
    return {
      type: "kan",
      tile,
      tiles: [tile, tile, tile, tile],
      redTiles: [Boolean(red), false, false, false],
      open: true,
      concealed: false,
      fixed: true,
    };
  }

  function upgradeLastPonToKan(tile, red = false) {
    const last = state.openMelds[state.openMelds.length - 1];
    if (!last || last.type !== "triplet" || last.tile !== tile || !last.open) return false;

    last.type = "kan";
    last.tiles = [tile, tile, tile, tile];
    last.redTiles = last.redTiles || [false, false, false];
    if (red) last.redTiles.push(true);
    else last.redTiles.push(false);
    return true;
  }

  function canUpgradeLastPon(tile) {
    const last = state.openMelds[state.openMelds.length - 1];
    return Boolean(last && last.type === "triplet" && last.tile === tile && last.open);
  }

  function openDraftCandidateTiles(draft = state.openDraft) {
    if (draft.length === 0) return new Set(Array.from({ length: 34 }, (_, i) => i));
    if (draft.length >= 3) return new Set();

    const candidates = new Set();

    if (draft.length === 1) {
      const [tile] = draft;
      candidates.add(tile);

      if (isSuitTile(tile)) {
        const suitStart = tile - (tile % 9);
        const n = tile % 9;
        for (const offset of [-2, -1, 1, 2]) {
          const nextNumber = n + offset;
          if (nextNumber >= 0 && nextNumber <= 8) {
            candidates.add(suitStart + nextNumber);
          }
        }
      }
      return candidates;
    }

    const [a, b] = draft;
    if (a === b) {
      candidates.add(a);
      return candidates;
    }

    if (!isSuitTile(a) || !isSuitTile(b) || tileSuit(a) !== tileSuit(b)) {
      return candidates;
    }

    const sorted = [a, b].sort((x, y) => x - y);
    const diff = sorted[1] - sorted[0];
    if (diff === 1) {
      const before = sorted[0] - 1;
      const after = sorted[1] + 1;
      if (canStartSequence(before)) candidates.add(before);
      if (canStartSequence(sorted[0])) candidates.add(after);
    } else if (diff === 2) {
      candidates.add(sorted[0] + 1);
    }

    for (const candidate of [...candidates]) {
      if (!isSuitTile(candidate) || tileSuit(candidate) !== tileSuit(a)) candidates.delete(candidate);
    }

    return candidates;
  }

  function currentModeCandidateTiles() {
    if (state.inputMode === "hand") return new Set(Array.from({ length: 34 }, (_, i) => i));

    if (state.inputMode === "closedKan") {
      return new Set(Array.from({ length: 34 }, (_, i) => i));
    }

    if (state.inputMode === "dora") {
      return new Set(Array.from({ length: 34 }, (_, i) => i));
    }

    const candidates = openDraftCandidateTiles();
    if (state.openDraft.length === 0) {
      for (let i = 0; i < 34; i += 1) {
        if (canUpgradeLastPon(i)) candidates.add(i);
      }
    }
    return candidates;
  }

  function isKokushi(counts) {
    if (totalTiles(counts) !== 14) return false;

    let pairCount = 0;
    for (let i = 0; i < 34; i += 1) {
      if (TERMINALS_AND_HONORS.has(i)) {
        if (counts[i] === 0) return false;
        if (counts[i] === 2) pairCount += 1;
        if (counts[i] > 2) return false;
      } else if (counts[i] > 0) {
        return false;
      }
    }

    return pairCount === 1;
  }

  function isChiitoitsu(counts) {
    if (totalTiles(counts) !== 14) return false;
    return counts.filter((count) => count === 2).length === 7;
  }

  function decomposeStandard(counts, fixed = []) {
    const remainingMelds = 4 - fixed.length;
    if (remainingMelds < 0) return [];
    if (totalTiles(counts) !== 2 + remainingMelds * 3) return [];

    const patterns = [];

    const extractMelds = (work, melds) => {
      let first = -1;
      for (let i = 0; i < 34; i += 1) {
        if (work[i] > 0) {
          first = i;
          break;
        }
      }

      if (first < 0) {
        if (melds.length === remainingMelds) return [melds.slice()];
        return [];
      }

      const results = [];

      if (work[first] >= 3) {
        work[first] -= 3;
        results.push(...extractMelds(work, [
          ...melds,
          { type: "triplet", tile: first, tiles: [first, first, first], open: false, concealed: true, fixed: false },
        ]));
        work[first] += 3;
      }

      if (canStartSequence(first) && work[first + 1] > 0 && work[first + 2] > 0) {
        work[first] -= 1;
        work[first + 1] -= 1;
        work[first + 2] -= 1;
        results.push(...extractMelds(work, [
          ...melds,
          { type: "sequence", base: first, tiles: [first, first + 1, first + 2], open: false, concealed: true, fixed: false },
        ]));
        work[first] += 1;
        work[first + 1] += 1;
        work[first + 2] += 1;
      }

      return results;
    };

    for (let pair = 0; pair < 34; pair += 1) {
      if (counts[pair] < 2) continue;
      const work = cloneCounts(counts);
      work[pair] -= 2;
      for (const melds of extractMelds(work, [])) {
        patterns.push({ type: "standard", pair, melds: [...fixed, ...melds] });
      }
    }

    return patterns;
  }

  function getWinningPatterns(counts, fixed = []) {
    const patterns = [];
    if (fixed.length === 0 && isKokushi(counts)) patterns.push({ type: "kokushi" });
    if (fixed.length === 0 && isChiitoitsu(counts)) patterns.push({ type: "chiitoitsu" });
    patterns.push(...decomposeStandard(counts, fixed));
    return patterns;
  }

  function allTilesSatisfy(counts, predicate) {
    for (let i = 0; i < 34; i += 1) {
      if (counts[i] > 0 && !predicate(i)) return false;
    }
    return true;
  }

  function getSuitsInfo(counts) {
    const suits = new Set();
    let hasHonors = false;

    for (let i = 0; i < 34; i += 1) {
      if (!counts[i]) continue;
      const suit = tileSuit(i);
      if (suit === "z") hasHonors = true;
      else suits.add(suit);
    }

    return { suits, hasHonors };
  }

  function isChuuren(counts) {
    const { suits, hasHonors } = getSuitsInfo(counts);
    if (hasHonors || suits.size !== 1) return false;
    const suit = [...suits][0];
    const offset = suit === "m" ? 0 : suit === "p" ? 9 : 18;
    const required = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    for (let i = 0; i < 9; i += 1) {
      if (counts[offset + i] < required[i]) return false;
    }
    return true;
  }

  function commonClosedYaku(counts, context, isTsumo) {
    const yaku = [];
    const menzen = isMenzen(context);

    if (context.riichi && menzen) yaku.push({ name: "リーチ", han: 1 });
    if (isTsumo && menzen) yaku.push({ name: "門前清自摸和", han: 1 });
    if (allTilesSatisfy(counts, isSimple)) yaku.push({ name: "断么九", han: 1 });

    const { suits, hasHonors } = getSuitsInfo(counts);
    if (suits.size === 1 && hasHonors) yaku.push({ name: "混一色", han: menzen ? 3 : 2 });
    if (suits.size === 1 && !hasHonors) yaku.push({ name: "清一色", han: menzen ? 6 : 5 });

    return yaku;
  }

  function commonYakuman(counts) {
    const yakuman = [];

    if (allTilesSatisfy(counts, isHonor)) yakuman.push({ name: "字一色", count: 1 });
    if (allTilesSatisfy(counts, isTerminal)) yakuman.push({ name: "清老頭", count: 1 });
    if (allTilesSatisfy(counts, (index) => GREEN_TILES.has(index))) yakuman.push({ name: "緑一色", count: 1 });
    if (isChuuren(counts)) yakuman.push({ name: "九蓮宝燈", count: 1 });

    return yakuman;
  }

  function evaluateKokushi(counts, context, isTsumo) {
    return buildScore({
      counts,
      context,
      isTsumo,
      fu: 0,
      yaku: commonClosedYaku(counts, context, isTsumo),
      yakuman: [{ name: "国士無双", count: 1 }],
      shapeName: "国士無双",
    });
  }

  function evaluateChiitoitsu(counts, context, isTsumo) {
    const yakuman = commonYakuman(counts);
    const yaku = commonClosedYaku(counts, context, isTsumo);

    if (allTilesSatisfy(counts, isTerminalOrHonor)) yaku.push({ name: "混老頭", han: 2 });
    yaku.push({ name: "七対子", han: 2 });

    return buildScore({
      counts,
      context,
      isTsumo,
      fu: 25,
      yaku,
      yakuman,
      shapeName: "七対子",
    });
  }

  function sequenceWaitIsRyanmen(meld, winningTile) {
    if (meld.type !== "sequence") return false;
    const baseNumber = tileNumber(meld.base);

    if (winningTile === meld.base) return baseNumber < 7;
    if (winningTile === meld.base + 2) return baseNumber > 1;
    return false;
  }

  function waitVariants(pattern, winningTile) {
    const variants = [];

    if (pattern.pair === winningTile) {
      variants.push({ kind: "pair", label: "単騎待ち" });
    }

    pattern.melds.forEach((meld, meldIndex) => {
      if (meld.fixed) return;
      if (!meld.tiles.includes(winningTile)) return;

      if (meld.type === "sequence") {
        const ryanmen = sequenceWaitIsRyanmen(meld, winningTile);
        variants.push({
          kind: "sequence",
          meldIndex,
          ryanmen,
          label: ryanmen ? "両面待ち" : (winningTile === meld.base + 1 ? "嵌張待ち" : "辺張待ち"),
        });
      } else {
        variants.push({ kind: "triplet", meldIndex, label: "双碰待ち" });
      }
    });

    return variants.length ? variants : [{ kind: "unknown", label: "待ち" }];
  }

  function sequenceKey(meld) {
    return `${tileSuit(meld.base)}${tileNumber(meld.base)}`;
  }

  function groupHasTerminalOrHonor(group) {
    return group.some(isTerminalOrHonor);
  }

  function groupHasTerminal(group) {
    return group.some(isTerminal);
  }

  function pairFu(pair, context) {
    let fu = 0;
    if (isDragon(pair)) fu += 2;
    if (pair === context.roundWind) fu += 2;
    if (pair === context.seatWind) fu += 2;
    return fu;
  }

  function isTripletLike(meld) {
    return meld.type === "triplet" || meld.type === "kan";
  }

  function evaluateStandard(counts, pattern, context, winningTile, isTsumo, variant) {
    const yaku = commonClosedYaku(counts, context, isTsumo);
    const yakuman = commonYakuman(counts);
    const menzen = isMenzen(context);

    const sequenceMelds = pattern.melds.filter((meld) => meld.type === "sequence");
    const tripletMelds = pattern.melds.filter(isTripletLike);
    const kanMelds = pattern.melds.filter((meld) => meld.type === "kan");
    const allSequences = sequenceMelds.length === 4;
    const allTriplets = tripletMelds.length === 4;

    const sequenceCounts = new Map();
    for (const meld of sequenceMelds) {
      const key = sequenceKey(meld);
      sequenceCounts.set(key, (sequenceCounts.get(key) || 0) + 1);
    }

    const doubleSequenceCount = [...sequenceCounts.values()].filter((count) => count >= 2).length;
    if (menzen && doubleSequenceCount >= 2) {
      yaku.push({ name: "二盃口", han: 3 });
    } else if (menzen && doubleSequenceCount === 1) {
      yaku.push({ name: "一盃口", han: 1 });
    }

    for (const meld of tripletMelds) {
      if (isDragon(meld.tile)) {
        yaku.push({ name: `役牌 ${TILE_DEFS[meld.tile].short}`, han: 1 });
      }
      if (meld.tile === context.roundWind) {
        yaku.push({ name: `場風 ${TILE_DEFS[meld.tile].short}`, han: 1 });
      }
      if (meld.tile === context.seatWind) {
        yaku.push({ name: `自風 ${TILE_DEFS[meld.tile].short}`, han: 1 });
      }
    }

    if (menzen && allSequences && pairFu(pattern.pair, context) === 0 && variant.kind === "sequence" && variant.ryanmen) {
      yaku.push({ name: "平和", han: 1 });
    }

    if (allTriplets) yaku.push({ name: "対々和", han: 2 });

    const concealedTriplets = tripletMelds.filter((meld, meldIndexInTriplets) => {
      const originalIndex = pattern.melds.indexOf(meld);
      const ronOpenedTriplet = !isTsumo && variant.kind === "triplet" && variant.meldIndex === originalIndex;
      return meld.concealed && !ronOpenedTriplet && meldIndexInTriplets >= 0;
    }).length;

    if (concealedTriplets >= 3) yaku.push({ name: "三暗刻", han: 2 });
    if (kanMelds.length === 3) yaku.push({ name: "三槓子", han: 2 });

    const sequenceBases = new Set(sequenceMelds.map((meld) => meld.base));
    for (let numberOffset = 0; numberOffset <= 6; numberOffset += 1) {
      if (
        sequenceBases.has(numberOffset) &&
        sequenceBases.has(9 + numberOffset) &&
        sequenceBases.has(18 + numberOffset)
      ) {
        yaku.push({ name: "三色同順", han: menzen ? 2 : 1 });
        break;
      }
    }

    for (const offset of [0, 9, 18]) {
      if (sequenceBases.has(offset) && sequenceBases.has(offset + 3) && sequenceBases.has(offset + 6)) {
        yaku.push({ name: "一気通貫", han: menzen ? 2 : 1 });
        break;
      }
    }

    for (let number = 0; number < 9; number += 1) {
      if (
        tripletMelds.some((meld) => meld.tile === number) &&
        tripletMelds.some((meld) => meld.tile === 9 + number) &&
        tripletMelds.some((meld) => meld.tile === 18 + number)
      ) {
        yaku.push({ name: "三色同刻", han: 2 });
        break;
      }
    }

    const dragonTriplets = tripletMelds.filter((meld) => isDragon(meld.tile)).length;
    const windTriplets = tripletMelds.filter((meld) => isWind(meld.tile)).length;
    if (dragonTriplets === 2 && isDragon(pattern.pair)) yaku.push({ name: "小三元", han: 2 });

    const groups = [
      [pattern.pair, pattern.pair],
      ...pattern.melds.map((meld) => meld.tiles),
    ];
    const everyGroupHasTerminalOrHonor = groups.every(groupHasTerminalOrHonor);
    const everyGroupHasTerminal = groups.every(groupHasTerminal);
    const hasSequence = sequenceMelds.length > 0;
    const hasHonor = counts.some((count, index) => count > 0 && isHonor(index));

    if (allTilesSatisfy(counts, isTerminalOrHonor)) yaku.push({ name: "混老頭", han: 2 });
    if (hasSequence && everyGroupHasTerminal && !hasHonor) {
      yaku.push({ name: "純全帯么九", han: menzen ? 3 : 2 });
    } else if (hasSequence && everyGroupHasTerminalOrHonor) {
      yaku.push({ name: "混全帯么九", han: menzen ? 2 : 1 });
    }

    if (dragonTriplets === 3) yakuman.push({ name: "大三元", count: 1 });
    if (windTriplets === 3 && isWind(pattern.pair)) yakuman.push({ name: "小四喜", count: 1 });
    if (windTriplets === 4) yakuman.push({ name: "大四喜", count: 1 });
    if (concealedTriplets === 4) yakuman.push({ name: "四暗刻", count: 1 });
    if (kanMelds.length === 4) yakuman.push({ name: "四槓子", count: 1 });

    const pinfu = yaku.some((item) => item.name === "平和");
    const fu = calculateFu({ pattern, context, winningTile, isTsumo, variant, pinfu });

    return buildScore({
      counts,
      context,
      isTsumo,
      fu,
      yaku,
      yakuman,
      shapeName: "通常手",
      waitLabel: variant.label,
    });
  }

  function calculateFu({ pattern, context, isTsumo, variant, pinfu }) {
    if (pinfu && isTsumo) return 20;

    let fu = 20;
    if (!isTsumo) fu += 10;
    if (isTsumo) fu += 2;

    fu += pairFu(pattern.pair, context);

    for (let meldIndex = 0; meldIndex < pattern.melds.length; meldIndex += 1) {
      const meld = pattern.melds[meldIndex];
      if (!isTripletLike(meld)) continue;

      const terminalOrHonor = isTerminalOrHonor(meld.tile);
      const openByRon = !isTsumo && variant.kind === "triplet" && variant.meldIndex === meldIndex;
      const openMeld = meld.open || openByRon;

      if (meld.type === "kan") {
        if (openMeld) fu += terminalOrHonor ? 16 : 8;
        else fu += terminalOrHonor ? 32 : 16;
      } else if (openMeld) {
        fu += terminalOrHonor ? 4 : 2;
      } else {
        fu += terminalOrHonor ? 8 : 4;
      }
    }

    if (variant.kind === "pair") fu += 2;
    if (variant.kind === "sequence" && !variant.ryanmen) fu += 2;

    return ceil10(fu);
  }

  function ceil10(value) {
    return Math.ceil(value / 10) * 10;
  }

  function limitBase(han, fu) {
    const rawBase = fu * (2 ** (han + 2));

    if (han >= 13) return { base: 8000, limitName: "数え役満" };
    if (han >= 11) return { base: 6000, limitName: "三倍満" };
    if (han >= 8) return { base: 4000, limitName: "倍満" };
    if (han >= 6) return { base: 3000, limitName: "跳満" };
    if (han >= 5 || rawBase >= 2000) return { base: 2000, limitName: "満貫" };
    return { base: rawBase, limitName: "" };
  }

  function buildScore({ counts, context, isTsumo, fu, yaku, yakuman, shapeName, waitLabel = "" }) {
    const isDealer = context.seatWind === 27;
    const yakumanCount = yakuman.reduce((sum, item) => sum + item.count, 0);
    const doraBreakdown = doraBreakdownForCounts(counts || [], context);
    const dora = doraBreakdown.total;
    const baseHan = yaku.reduce((sum, item) => sum + item.han, 0);
    const scoredYaku = yakumanCount > 0 || dora === 0
      ? yaku
      : [
        ...yaku,
        ...(doraBreakdown.indicatorDora ? [{ name: "ドラ", han: doraBreakdown.indicatorDora }] : []),
        ...(doraBreakdown.redDora ? [{ name: "赤ドラ", han: doraBreakdown.redDora }] : []),
      ];
    let han = scoredYaku.reduce((sum, item) => sum + item.han, 0);
    let base;
    let limitName = "";

    if (yakumanCount > 0) {
      base = 8000 * yakumanCount;
      han = 0;
      limitName = yakumanCount > 1 ? `${yakumanCount}倍役満` : "役満";
    } else {
      if (baseHan <= 0) return null;
      const limit = limitBase(han, fu);
      base = limit.base;
      limitName = limit.limitName;
    }

    let display;
    let total;

    if (isTsumo) {
      if (isDealer) {
        const all = ceil100(base * 2);
        display = `${all.toLocaleString("ja-JP")}点オール`;
        total = all * 3;
      } else {
        const childPay = ceil100(base);
        const dealerPay = ceil100(base * 2);
        display = `${childPay.toLocaleString("ja-JP")} / ${dealerPay.toLocaleString("ja-JP")}点`;
        total = childPay * 2 + dealerPay;
      }
    } else {
      const points = ceil100(base * (isDealer ? 6 : 4));
      display = `${points.toLocaleString("ja-JP")}点`;
      total = points;
    }

    return {
      method: isTsumo ? "tsumo" : "ron",
      display,
      total,
      han,
      fu,
      yaku: scoredYaku,
      yakuman,
      yakumanCount,
      limitName,
      shapeName,
      waitLabel,
      isDealer,
    };
  }

  function scorePattern(counts, pattern, context, winningTile, isTsumo) {
    if (pattern.type === "kokushi") return evaluateKokushi(counts, context, isTsumo);
    if (pattern.type === "chiitoitsu") return evaluateChiitoitsu(counts, context, isTsumo);

    const scores = [];
    for (const variant of waitVariants(pattern, winningTile)) {
      const score = evaluateStandard(counts, pattern, context, winningTile, isTsumo, variant);
      if (score) scores.push(score);
    }
    return bestScore(scores);
  }

  function scoreWinningTile(originalCounts, winningTile, context) {
    const fixed = context.fixedMelds || [];
    const redCounts = cloneCounts(context.redCounts || Array(34).fill(0));
    if (context.winningRed) redCounts[winningTile] += 1;
    const scoreContext = { ...context, redCounts };
    const closedCounts = addTile(originalCounts, winningTile);
    const counts = cloneCounts(closedCounts);
    for (const meld of fixed) addTilesToCounts(counts, meld.tiles);

    const patterns = getWinningPatterns(closedCounts, fixed);
    if (!patterns.length) return null;

    const ronScores = [];
    const tsumoScores = [];

    for (const pattern of patterns) {
      const ron = scorePattern(counts, pattern, scoreContext, winningTile, false);
      const tsumo = scorePattern(counts, pattern, scoreContext, winningTile, true);
      if (ron) ronScores.push(ron);
      if (tsumo) tsumoScores.push(tsumo);
    }

    return {
      tile: winningTile,
      winningRed: Boolean(context.winningRed),
      remaining: context.winningRemaining ?? Math.max(
        0,
        4 - (context.usedCounts?.[winningTile] ?? originalCounts[winningTile]),
      ),
      ron: bestScore(ronScores),
      tsumo: bestScore(tsumoScores),
      patternCount: patterns.length,
    };
  }

  function compareScorePriority(a, b) {
    if ((a.yakumanCount || 0) !== (b.yakumanCount || 0)) {
      return (a.yakumanCount || 0) - (b.yakumanCount || 0);
    }
    if (a.han !== b.han) return a.han - b.han;
    if (a.total !== b.total) return a.total - b.total;
    return 0;
  }

  function bestScore(scores) {
    if (!scores.length) return null;
    return scores.slice().sort((a, b) => compareScorePriority(b, a))[0];
  }

  function analyzeTenpai(counts, context = state.settings) {
    const waits = [];
    const usedCounts = context.usedCounts || counts;
    const redCounts = context.redCounts || Array(34).fill(0);

    for (let tile = 0; tile < 34; tile += 1) {
      const remaining = Math.max(0, 4 - usedCounts[tile]);
      if (!remaining) continue;

      const redRemaining = isRedTileIndex(tile)
        ? Math.max(0, 1 - redCounts[tile])
        : 0;
      const normalRemaining = remaining - redRemaining;
      const variants = [];

      if (normalRemaining > 0) {
        variants.push(scoreWinningTile(counts, tile, {
          ...context,
          usedCounts,
          winningRed: false,
          winningRemaining: normalRemaining,
        }));
      }
      if (redRemaining > 0) {
        variants.push(scoreWinningTile(counts, tile, {
          ...context,
          usedCounts,
          winningRed: true,
          winningRemaining: redRemaining,
        }));
      }

      const validVariants = variants.filter(Boolean);
      if (!validVariants.length) continue;

      const normal = validVariants.find((variant) => !variant.winningRed) || null;
      const red = validVariants.find((variant) => variant.winningRed) || null;
      waits.push({
        tile,
        remaining,
        normal,
        red,
        ron: bestScore(validVariants.map((variant) => variant.ron).filter(Boolean)),
        tsumo: bestScore(validVariants.map((variant) => variant.tsumo).filter(Boolean)),
        patternCount: Math.max(...validVariants.map((variant) => variant.patternCount)),
      });
    }

    waits.sort((a, b) => {
      const aBest = Math.max(a.ron?.total || 0, a.tsumo?.total || 0);
      const bBest = Math.max(b.ron?.total || 0, b.tsumo?.total || 0);
      if (aBest !== bBest) return bBest - aBest;
      if (a.remaining !== b.remaining) return b.remaining - a.remaining;
      return a.tile - b.tile;
    });

    return waits;
  }

  const shantenMemo = new Map();

  function countsKey(counts) {
    return counts.join("");
  }

  function normalShantenForFixed(inputCounts, fixedCount = 0) {
    const key = `${fixedCount}:${countsKey(inputCounts)}`;
    if (shantenMemo.has(`normal:${key}`)) return shantenMemo.get(`normal:${key}`);

    const counts = cloneCounts(inputCounts);
    let best = 8;

    const updateBest = (melds, taatsu, hasPair) => {
      const usableTaatsu = Math.min(taatsu, Math.max(0, 4 - fixedCount - melds));
      const value = 8 - (fixedCount + melds) * 2 - usableTaatsu - (hasPair ? 1 : 0);
      if (value < best) best = value;
    };

    const dfs = (startIndex, melds, taatsu, hasPair) => {
      if (best === -1 || melds > 4 - fixedCount || taatsu > 4) return;

      let index = startIndex;
      while (index < 34 && counts[index] === 0) index += 1;

      if (index >= 34) {
        updateBest(melds, taatsu, hasPair);
        return;
      }

      if (counts[index] >= 3) {
        counts[index] -= 3;
        dfs(index, melds + 1, taatsu, hasPair);
        counts[index] += 3;
      }

      if (canStartSequence(index) && counts[index + 1] > 0 && counts[index + 2] > 0) {
        counts[index] -= 1;
        counts[index + 1] -= 1;
        counts[index + 2] -= 1;
        dfs(index, melds + 1, taatsu, hasPair);
        counts[index] += 1;
        counts[index + 1] += 1;
        counts[index + 2] += 1;
      }

      if (!hasPair && counts[index] >= 2) {
        counts[index] -= 2;
        dfs(index, melds, taatsu, true);
        counts[index] += 2;
      }

      if (counts[index] >= 2) {
        counts[index] -= 2;
        dfs(index, melds, taatsu + 1, hasPair);
        counts[index] += 2;
      }

      if (canStartTwoSidedTaatsu(index) && counts[index + 1] > 0) {
        counts[index] -= 1;
        counts[index + 1] -= 1;
        dfs(index, melds, taatsu + 1, hasPair);
        counts[index] += 1;
        counts[index + 1] += 1;
      }

      if (canStartSequence(index) && counts[index + 2] > 0) {
        counts[index] -= 1;
        counts[index + 2] -= 1;
        dfs(index, melds, taatsu + 1, hasPair);
        counts[index] += 1;
        counts[index + 2] += 1;
      }

      counts[index] -= 1;
      dfs(index, melds, taatsu, hasPair);
      counts[index] += 1;
    };

    dfs(0, 0, 0, false);
    shantenMemo.set(`normal:${key}`, best);
    return best;
  }

  function chiitoitsuShanten(counts) {
    let pairs = 0;
    let uniqueTiles = 0;

    for (const count of counts) {
      if (count > 0) uniqueTiles += 1;
      if (count >= 2) pairs += 1;
    }

    return 6 - pairs + Math.max(0, 7 - uniqueTiles);
  }

  function kokushiShanten(counts) {
    let uniqueTerminals = 0;
    let hasPair = false;

    for (const index of TERMINALS_AND_HONORS) {
      if (counts[index] > 0) uniqueTerminals += 1;
      if (counts[index] >= 2) hasPair = true;
    }

    return 13 - uniqueTerminals - (hasPair ? 1 : 0);
  }

  function minShanten(counts, fixedCount = 0) {
    const key = `${fixedCount}:${countsKey(counts)}`;
    const memoKey = `min:${key}`;
    if (shantenMemo.has(memoKey)) return shantenMemo.get(memoKey);

    const values = {
      normal: normalShantenForFixed(counts, fixedCount),
      chiitoitsu: fixedCount === 0 ? chiitoitsuShanten(counts) : 99,
      kokushi: fixedCount === 0 ? kokushiShanten(counts) : 99,
    };
    const shanten = Math.min(values.normal, values.chiitoitsu, values.kokushi);
    const typeNames = [];

    if (values.normal === shanten) typeNames.push("通常手");
    if (values.chiitoitsu === shanten) typeNames.push("七対子");
    if (values.kokushi === shanten) typeNames.push("国士無双");

    const result = { shanten, values, typeNames };
    shantenMemo.set(memoKey, result);
    return result;
  }

  function formatShantenText(value) {
    if (value < 0) return "和了";
    if (value === 0) return "テンパイ";
    return `${value}シャンテン`;
  }

  function usedCountsForEv(counts, context, unavailableCounts = []) {
    const usedCounts = cloneCounts(counts);
    for (const meld of context.fixedMelds || []) addTilesToCounts(usedCounts, meld.tiles);
    addTilesToCounts(usedCounts, context.doraIndicators || []);
    for (let tile = 0; tile < 34; tile += 1) {
      usedCounts[tile] += unavailableCounts[tile] || 0;
    }
    return usedCounts;
  }

  function usedRedCountsForEv(redCounts, context, unavailableRedCounts = []) {
    const usedRedCounts = cloneCounts(redCounts || Array(34).fill(0));
    const fixedRedCounts = context.fixedRedCounts || redCountsFromMelds(context.fixedMelds || []);
    for (let tile = 0; tile < 34; tile += 1) {
      usedRedCounts[tile] += fixedRedCounts[tile] || 0;
      usedRedCounts[tile] += unavailableRedCounts[tile] || 0;
    }
    return usedRedCounts;
  }

  function redCountsForScoring(redCounts, context, winningTile = -1) {
    const totalRedCounts = usedRedCountsForEv(redCounts, context);
    if (winningTile >= 0) totalRedCounts[winningTile] += 1;
    return totalRedCounts;
  }

  function emptyExpectedValue() {
    return {
      points: 0,
      wins: 0,
      peakScore: 0,
      peakHan: -1,
      peakProbability: 0,
      peakRoute: null,
    };
  }

  function considerPeakRoute(result, candidate, probability) {
    if (!candidate.peakRoute) return;

    const comparison = result.peakRoute
      ? compareScorePriority(candidate.peakRoute, result.peakRoute)
      : 1;
    if (comparison > 0 || (comparison === 0 && probability > result.peakProbability)) {
      result.peakScore = candidate.peakScore;
      result.peakHan = candidate.peakHan;
      result.peakProbability = probability;
      result.peakRoute = candidate.peakRoute;
    }
  }

  function valuePotential(counts, context, redCounts = []) {
    // Dora indicators are unavailable tiles, not tiles in the hand.  They
    // must not create a fake pair or make an isolated honor look useful.
    const allCounts = cloneCounts(counts);
    for (const meld of context.fixedMelds || []) addTilesToCounts(allCounts, meld.tiles);
    const suitCounts = [0, 0, 0];
    let honorCount = 0;
    let isolatedHonorCount = 0;
    let honorTripletCount = 0;
    let pairCount = 0;
    let completedSequenceCount = 0;
    let duplicateSequenceCount = 0;
    const sequencePresence = Array.from({ length: 3 }, () => Array(7).fill(false));

    for (let tile = 0; tile < 34; tile += 1) {
      if (allCounts[tile] >= 2) pairCount += 1;
      if (tile >= 27) {
        honorCount += allCounts[tile];
        if (allCounts[tile] === 1) isolatedHonorCount += 1;
        if (allCounts[tile] >= 3) honorTripletCount += Math.floor(allCounts[tile] / 3);
      }
      else suitCounts[Math.floor(tile / 9)] += allCounts[tile];
    }

    for (let suit = 0; suit < 3; suit += 1) {
      const offset = suit * 9;
      for (let base = 0; base <= 6; base += 1) {
        const sequenceCount = Math.min(
          allCounts[offset + base],
          allCounts[offset + base + 1],
          allCounts[offset + base + 2],
        );
        if (sequenceCount > 0) {
          completedSequenceCount += sequenceCount;
          if (sequenceCount >= 2) duplicateSequenceCount += 1;
          sequencePresence[suit][base] = true;
        }
      }
    }

    const ittsuPotential = sequencePresence
      .filter((presence) => presence[0] && presence[3] && presence[6]).length;
    let sanshokuPotential = 0;
    let supportedSanshokuPotential = 0;
    for (let base = 0; base <= 6; base += 1) {
      const suitCount = sequencePresence.filter((presence) => presence[base]).length;
      if (suitCount >= 2) sanshokuPotential += suitCount - 1;

      const supports = [0, 1, 2].map((suit) => sequenceSupport(allCounts, suit, base));
      const supportedSuitCount = supports.filter((support) => support.partial).length;
      const completeSuitCount = supports.filter((support) => support.complete).length;
      if (supportedSuitCount === 3 && completeSuitCount >= 2 && completeSuitCount < 3) {
        // Keep a developing sanshoku route when one suit still needs a tile.
        // This is deliberately stronger than the completed-sequence signal so
        // that a structurally supported hand is not pruned in favor of a
        // route that needs to draw an honor triplet from scratch.
        supportedSanshokuPotential += 8 + completeSuitCount * 4;
      }
    }

    const bestSuitCount = Math.max(...suitCounts);
    const total = totalTiles(allCounts);
    const offSuitCount = total - bestSuitCount - honorCount;
    const redCount = RED_TILE_INDICES.size > 0
      ? [...RED_TILE_INDICES].reduce((sum, tile) => sum + (redCounts[tile] || 0), 0)
      : 0;

    // This is only a branch-pruning signal. Actual points come from a
    // completed hand scored by scoreWinningTile.
    return bestSuitCount * 3
      - offSuitCount * 4
      + pairCount
      + completedSequenceCount
      + duplicateSequenceCount * 4
      + ittsuPotential * 5
      + sanshokuPotential * 3
      + supportedSanshokuPotential
      + honorTripletCount * 6
      - isolatedHonorCount * 2
      + redCount * 3;
  }

  function candidateDiscardsAfterDraw(
    afterDraw,
    afterRedCounts,
    drawsLeft,
    fixedCount,
    context,
    unavailableCounts = Array(34).fill(0),
    unavailableRedCounts = Array(34).fill(0),
  ) {
    const candidates = [];

    for (let discard = 0; discard < 34; discard += 1) {
      if (!afterDraw[discard]) continue;

      const redCopies = Math.min(afterDraw[discard], afterRedCounts[discard] || 0);
      const normalCopies = afterDraw[discard] - redCopies;
      const variants = [
        { discardRed: false, copies: normalCopies },
        { discardRed: true, copies: redCopies },
      ];

      for (const variant of variants) {
        if (!variant.copies) continue;

        const afterDiscard = cloneCounts(afterDraw);
        afterDiscard[discard] -= 1;
        const nextRedCounts = cloneCounts(afterRedCounts);
        if (variant.discardRed) nextRedCounts[discard] -= 1;
        const nextUnavailableCounts = cloneCounts(unavailableCounts);
        nextUnavailableCounts[discard] += 1;
        const nextUnavailableRedCounts = cloneCounts(unavailableRedCounts);
        if (variant.discardRed) nextUnavailableRedCounts[discard] += 1;
        const info = minShanten(afterDiscard, fixedCount);
        if (info.shanten >= drawsLeft - 1) continue;
        candidates.push({
          discard,
          discardRed: variant.discardRed,
          counts: afterDiscard,
          redCounts: nextRedCounts,
          unavailableCounts: nextUnavailableCounts,
          unavailableRedCounts: nextUnavailableRedCounts,
          shanten: info.shanten,
          potential: valuePotential(afterDiscard, context, nextRedCounts),
        });
      }
    }

    if (!candidates.length) return [];

    candidates.sort((a, b) => {
      if (a.shanten !== b.shanten) return a.shanten - b.shanten;
      if (a.potential !== b.potential) return b.potential - a.potential;
      return a.discard - b.discard;
    });

    const bestShanten = candidates[0].shanten;
    const selected = candidates
      .filter((candidate) => candidate.shanten === bestShanten)
      .slice(0, EV_BRANCH_LIMIT);
    const detours = candidates
      .filter((candidate) => candidate.shanten > bestShanten && candidate.shanten <= bestShanten + 1)
      .slice(0, EV_VALUE_DETOUR_LIMIT);

    return [...selected, ...detours];
  }

  function candidateDrawsForState(
    counts,
    redCounts,
    fixedCount,
    context,
    currentShanten,
    allowValueDraws = true,
    unavailableCounts = Array(34).fill(0),
    unavailableRedCounts = Array(34).fill(0),
  ) {
    const usedCounts = usedCountsForEv(counts, context, unavailableCounts);
    const usedRedCounts = usedRedCountsForEv(redCounts, context, unavailableRedCounts);
    const currentAcceptance = allowValueDraws
      ? strictAcceptanceForState(
        counts,
        redCounts,
        fixedCount,
        context,
        unavailableCounts,
        unavailableRedCounts,
      )
      : null;
    const candidates = [];

    for (let tile = 0; tile < 34; tile += 1) {
      const remaining = Math.max(0, 4 - usedCounts[tile]);
      if (!remaining) continue;

      const redRemaining = isRedTileIndex(tile)
        ? Math.max(0, 1 - usedRedCounts[tile])
        : 0;
      const normalRemaining = remaining - redRemaining;
      const variants = [
        { drawRed: false, copies: normalRemaining },
        { drawRed: true, copies: redRemaining },
      ];

      for (const variant of variants) {
        if (!variant.copies) continue;

        const afterDraw = addTile(counts, tile);
        const nextRedCounts = cloneCounts(redCounts);
        if (variant.drawRed) nextRedCounts[tile] += 1;
        const info = minShanten(afterDraw, fixedCount);
        let winning = null;
        if (info.shanten < 0) {
          winning = scoreWinningTile(counts, tile, {
            ...context,
            usedCounts,
            redCounts: redCountsForScoring(redCounts, context),
            winningRed: variant.drawRed,
          });
        }

        if (winning?.tsumo) {
          candidates.push({
            tile,
            drawRed: variant.drawRed,
            remaining: variant.copies,
            winning,
            priority: 4,
            potential: Number.POSITIVE_INFINITY,
          });
          continue;
        }

        const shantenDelta = info.shanten - currentShanten;
        if (shantenDelta > 1) continue;

        let nextAcceptance = null;
        if (shantenDelta === 0) {
          if (!allowValueDraws) continue;
          nextAcceptance = bestAcceptanceAfterDraw(
            afterDraw,
            nextRedCounts,
            currentShanten,
            fixedCount,
            context,
            tile,
            counts[tile],
            unavailableCounts,
            unavailableRedCounts,
          );
          if (
            !nextAcceptance
            || nextAcceptance.total <= currentAcceptance.total
            || !tileHasShapeSupport(nextAcceptance.counts, tile)
          ) continue;
        }

        candidates.push({
          tile,
          drawRed: variant.drawRed,
          remaining: variant.copies,
          winning: null,
          afterDraw,
          redCounts: nextRedCounts,
          info,
          priority: shantenDelta < 0 ? 3 : shantenDelta === 0 ? 2 : 1,
          potential: valuePotential(afterDraw, context, nextRedCounts),
          nextAcceptance: nextAcceptance?.total || 0,
        });
      }
    }

    const winning = candidates
      .filter((candidate) => candidate.winning)
      .sort((a, b) => compareScorePriority(b.winning.tsumo, a.winning.tsumo))
      .slice(0, EV_WINNING_LIMIT);
    const improving = candidates
      .filter((candidate) => candidate.priority === 3)
      .sort((a, b) => b.potential - a.potential)
      .slice(0, EV_DRAW_IMPROVING_LIMIT);
    const maintaining = candidates
      .filter((candidate) => (
        allowValueDraws
        &&
        candidate.priority === 2
        && candidate.nextAcceptance > currentAcceptance.total + EV_VALUE_GAIN_THRESHOLD
      ))
      .sort((a, b) => {
        if (a.nextAcceptance !== b.nextAcceptance) {
          return b.nextAcceptance - a.nextAcceptance;
        }
        return b.potential - a.potential;
      })
      .slice(0, EV_DRAW_SAME_LIMIT);
    const detours = candidates
      .filter((candidate) => candidate.priority === 1)
      .sort((a, b) => b.potential - a.potential)
      .slice(0, EV_DRAW_DETOUR_LIMIT);

    return [...winning, ...improving, ...maintaining, ...detours];
  }

  function createExpectedValueEvaluator(context, fixedCount) {
    const memo = new Map();
    const discardMemo = new Map();

    const evaluateState = (
      counts,
      redCounts,
      drawsLeft,
      valueOpen = true,
      unavailableCounts = Array(34).fill(0),
      unavailableRedCounts = Array(34).fill(0),
    ) => {
      if (drawsLeft <= 0) return emptyExpectedValue();

      const key = `${drawsLeft}:${valueOpen ? "1" : "0"}:${countsKey(counts)}:${countsKey(redCounts)}:${countsKey(unavailableCounts)}:${countsKey(unavailableRedCounts)}`;
      if (memo.has(key)) return memo.get(key);

      const info = minShanten(counts, fixedCount);
      if (info.shanten >= drawsLeft) {
        const result = emptyExpectedValue();
        memo.set(key, result);
        return result;
      }

      const usedCounts = usedCountsForEv(counts, context, unavailableCounts);
      let totalRemaining = 0;
      for (let tile = 0; tile < 34; tile += 1) {
        totalRemaining += Math.max(0, 4 - usedCounts[tile]);
      }

      if (totalRemaining <= 0) {
        const result = emptyExpectedValue();
        memo.set(key, result);
        return result;
      }

      const result = emptyExpectedValue();
      const drawCandidates = candidateDrawsForState(
        counts,
        redCounts,
        fixedCount,
        context,
        info.shanten,
        valueOpen,
        unavailableCounts,
        unavailableRedCounts,
      );
      let coveredProbability = 0;

      for (const candidate of drawCandidates) {
        const { tile, remaining, winning } = candidate;
        const probability = remaining / totalRemaining;
        coveredProbability += probability;

        let child;
        if (winning?.tsumo) {
          child = {
            points: winning.tsumo.total,
            wins: 1,
            peakScore: winning.tsumo.total,
            peakHan: winning.tsumo.han,
            peakProbability: 1,
            peakRoute: winning.tsumo,
          };
        } else {
          const afterDraw = candidate.afterDraw;
          const discardKey = `${drawsLeft}:${countsKey(afterDraw)}:${countsKey(candidate.redCounts)}:${countsKey(unavailableCounts)}:${countsKey(unavailableRedCounts)}`;
          let discardCandidates = discardMemo.get(discardKey);
          if (!discardCandidates) {
            discardCandidates = candidateDiscardsAfterDraw(
              afterDraw,
              candidate.redCounts,
              drawsLeft,
              fixedCount,
              context,
              unavailableCounts,
              unavailableRedCounts,
            );
            discardMemo.set(discardKey, discardCandidates);
          }
          let bestChild = null;
          for (const discardCandidate of discardCandidates) {
            const candidateChild = evaluateState(
              discardCandidate.counts,
              discardCandidate.redCounts,
              drawsLeft - 1,
              false,
              discardCandidate.unavailableCounts,
              discardCandidate.unavailableRedCounts,
            );
            if (
              !bestChild
              || candidateChild.points > bestChild.points
              || (
                candidateChild.points === bestChild.points
                && candidateChild.wins > bestChild.wins
              )
            ) {
              bestChild = candidateChild;
            }
          }
          if (bestChild) {
            child = bestChild;
          } else {
            child = emptyExpectedValue();
          }
        }

        result.points += probability * child.points;
        result.wins += probability * child.wins;
        considerPeakRoute(result, child, probability * child.peakProbability);
      }

      const omittedProbability = Math.max(0, 1 - coveredProbability);
      if (omittedProbability > 0 && drawsLeft > 1) {
        const noChange = evaluateState(
          counts,
          redCounts,
          drawsLeft - 1,
          valueOpen,
          unavailableCounts,
          unavailableRedCounts,
        );
        result.points += omittedProbability * noChange.points;
        result.wins += omittedProbability * noChange.wins;
        considerPeakRoute(result, noChange, omittedProbability * noChange.peakProbability);
      }

      memo.set(key, result);
      return result;
    };

    return evaluateState;
  }

  function strictAcceptanceForState(
    counts,
    redCounts,
    fixedCount,
    context,
    unavailableCounts = Array(34).fill(0),
    unavailableRedCounts = Array(34).fill(0),
  ) {
    const shanten = minShanten(counts, fixedCount);
    const usedCounts = usedCountsForEv(counts, context, unavailableCounts);
    const usedRedCounts = usedRedCountsForEv(redCounts, context, unavailableRedCounts);
    const accepts = [];
    let total = 0;

    for (let draw = 0; draw < 34; draw += 1) {
      const remaining = Math.max(0, 4 - usedCounts[draw]);
      if (!remaining) continue;

      const redRemaining = isRedTileIndex(draw)
        ? Math.max(0, 1 - usedRedCounts[draw])
        : 0;
      const normalRemaining = remaining - redRemaining;
      const drawVariants = [
        { drawRed: false, copies: normalRemaining },
        { drawRed: true, copies: redRemaining },
      ];

      for (const drawVariant of drawVariants) {
        if (!drawVariant.copies) continue;
        const afterDraw = addTile(counts, draw);
        const drawInfo = minShanten(afterDraw, fixedCount);
        if (drawInfo.shanten >= shanten.shanten) continue;

        accepts.push({
          tile: draw,
          drawRed: drawVariant.drawRed,
          remaining: drawVariant.copies,
          shanten: drawInfo.shanten,
        });
        total += drawVariant.copies;
      }
    }

    return { shanten, accepts, total };
  }

  function tileHasShapeSupport(counts, tile) {
    if (counts[tile] >= 2) return true;
    if (!isSuitTile(tile)) return false;

    const position = tile % 9;
    const offset = Math.floor(tile / 9) * 9;
    for (let base = 0; base <= 6; base += 1) {
      if (position < base || position > base + 2) continue;
      const sequence = [offset + base, offset + base + 1, offset + base + 2];
      if (sequence.some((candidate) => candidate !== tile && counts[candidate] > 0)) {
        return true;
      }
    }

    return false;
  }

  function bestAcceptanceAfterDraw(
    afterDraw,
    afterRedCounts,
    baseShanten,
    fixedCount,
    context,
    requiredTile = -1,
    requiredMinimumCount = -1,
    unavailableCounts = Array(34).fill(0),
    unavailableRedCounts = Array(34).fill(0),
  ) {
    let best = null;

    for (let discard = 0; discard < 34; discard += 1) {
      if (!afterDraw[discard]) continue;

      const redCopies = Math.min(afterDraw[discard], afterRedCounts[discard] || 0);
      const normalCopies = afterDraw[discard] - redCopies;
      const variants = [
        { discardRed: false, copies: normalCopies },
        { discardRed: true, copies: redCopies },
      ];

      for (const variant of variants) {
        if (!variant.copies) continue;

        const afterDiscard = cloneCounts(afterDraw);
        afterDiscard[discard] -= 1;
        if (
          requiredTile >= 0
          && afterDiscard[requiredTile] <= requiredMinimumCount
        ) continue;
        const nextRedCounts = cloneCounts(afterRedCounts);
        if (variant.discardRed) nextRedCounts[discard] -= 1;
        const nextUnavailableCounts = cloneCounts(unavailableCounts);
        nextUnavailableCounts[discard] += 1;
        const nextUnavailableRedCounts = cloneCounts(unavailableRedCounts);
        if (variant.discardRed) nextUnavailableRedCounts[discard] += 1;
        const info = minShanten(afterDiscard, fixedCount);
        if (info.shanten > baseShanten) continue;

        const acceptance = strictAcceptanceForState(
          afterDiscard,
          nextRedCounts,
          fixedCount,
          context,
          nextUnavailableCounts,
          nextUnavailableRedCounts,
        );
        const candidate = {
          discard,
          discardRed: variant.discardRed,
          shanten: info.shanten,
          total: acceptance.total,
          potential: valuePotential(afterDiscard, context, nextRedCounts),
          counts: afterDiscard,
          redCounts: nextRedCounts,
          unavailableCounts: nextUnavailableCounts,
          unavailableRedCounts: nextUnavailableRedCounts,
        };

        if (
          !best
          || candidate.shanten < best.shanten
          || (
            candidate.shanten === best.shanten
            && (
              candidate.total > best.total
              || (
                candidate.total === best.total
                && candidate.potential > best.potential
              )
            )
          )
        ) {
          best = candidate;
        }
      }
    }

    return best;
  }

  function analyzeExpectedValue(counts, context = state.settings, {
    maxShanten = EV_MAX_SHANTEN,
    maxDraws = EV_MAX_DRAWS,
  } = {}) {
    const fixedCount = (context.fixedMelds || []).length;
    const currentShanten = minShanten(counts, fixedCount);
    if (currentShanten.shanten > maxShanten) {
      return { currentShanten, options: [], skipped: true, maxDraws };
    }

    const options = [];
    const evaluateState = createExpectedValueEvaluator(context, fixedCount);
    const redCounts = cloneCounts(
      context.concealedRedCounts || context.redCounts || Array(34).fill(0),
    );

    for (let discard = 0; discard < 34; discard += 1) {
      if (!counts[discard]) continue;

      const redCopies = Math.min(counts[discard], redCounts[discard] || 0);
      const normalCopies = counts[discard] - redCopies;
      const variants = [
        { discardRed: false, copies: normalCopies },
        { discardRed: true, copies: redCopies },
      ];

      for (const variant of variants) {
        if (!variant.copies) continue;

        const afterDiscard = cloneCounts(counts);
        afterDiscard[discard] -= 1;
        const afterRedCounts = cloneCounts(redCounts);
        if (variant.discardRed) afterRedCounts[discard] -= 1;
        const unavailableCounts = Array(34).fill(0);
        unavailableCounts[discard] = 1;
        const unavailableRedCounts = Array(34).fill(0);
        if (variant.discardRed) unavailableRedCounts[discard] = 1;
        const afterInfo = minShanten(afterDiscard, fixedCount);
        // A discard must not make the hand farther from tenpai.  Value-oriented
        // routes are allowed only when the current shanten is maintained or
        // improved; an initial one-shanten detour is not a candidate.
        if (afterInfo.shanten > currentShanten.shanten) continue;
        const strictAcceptance = strictAcceptanceForState(
          afterDiscard,
          afterRedCounts,
          fixedCount,
          context,
          unavailableCounts,
          unavailableRedCounts,
        );
        const accepts = strictAcceptance.accepts.slice();
        let totalAcceptance = strictAcceptance.total;
        const expected = afterInfo.shanten <= maxShanten
          ? evaluateState(
            afterDiscard,
            afterRedCounts,
            maxDraws,
            afterInfo.shanten <= currentShanten.shanten,
            unavailableCounts,
            unavailableRedCounts,
          )
          : emptyExpectedValue();
        const usedCounts = usedCountsForEv(afterDiscard, context, unavailableCounts);
        const usedRedCounts = usedRedCountsForEv(
          afterRedCounts,
          context,
          unavailableRedCounts,
        );

        for (let draw = 0; draw < 34; draw += 1) {
          const remaining = Math.max(0, 4 - usedCounts[draw]);
          if (!remaining) continue;

          const redRemaining = isRedTileIndex(draw)
            ? Math.max(0, 1 - usedRedCounts[draw])
            : 0;
          const normalRemaining = remaining - redRemaining;
          const drawVariants = [
            { drawRed: false, copies: normalRemaining },
            { drawRed: true, copies: redRemaining },
          ];

          for (const drawVariant of drawVariants) {
            if (!drawVariant.copies) continue;
            const afterDraw = addTile(afterDiscard, draw);
            const drawInfo = minShanten(afterDraw, fixedCount);
            if (drawInfo.shanten !== afterInfo.shanten) continue;

            const nextAcceptance = bestAcceptanceAfterDraw(
              afterDraw,
              drawVariant.drawRed
                ? addTile(afterRedCounts, draw)
                : afterRedCounts,
              afterInfo.shanten,
              fixedCount,
              context,
              draw,
              afterDiscard[draw],
              unavailableCounts,
              unavailableRedCounts,
            );
            if (
              !nextAcceptance
              || nextAcceptance.total <= strictAcceptance.total
              || !tileHasShapeSupport(nextAcceptance.counts, draw)
            ) continue;

            const nextExpected = evaluateState(
              nextAcceptance.counts,
              nextAcceptance.redCounts,
              Math.max(0, maxDraws - 1),
              false,
              nextAcceptance.unavailableCounts,
              nextAcceptance.unavailableRedCounts,
            );
            const peakScoreImprovement = nextExpected.peakRoute
              && (
                !expected.peakRoute
                || compareScorePriority(nextExpected.peakRoute, expected.peakRoute) > 0
              );
            const expectedAverage = expected.wins > 0
              ? expected.points / expected.wins
              : 0;
            const nextExpectedAverage = nextExpected.wins > 0
              ? nextExpected.points / nextExpected.wins
              : 0;

            accepts.push({
              tile: draw,
              drawRed: drawVariant.drawRed,
              remaining: drawVariant.copies,
              shanten: drawInfo.shanten,
              shapeImprovement: true,
              nextAcceptance: nextAcceptance.total,
              scoreImprovement: Boolean(
                peakScoreImprovement
                || nextExpectedAverage > expectedAverage + 0.5
              ),
            });
            totalAcceptance += drawVariant.copies;
          }
        }

        options.push({
          discard,
          discardRed: variant.discardRed,
          afterShanten: afterInfo.shanten,
          afterTypes: afterInfo.typeNames,
          accepts,
          totalAcceptance,
          expectedPoints: expected.points,
          winProbability: expected.wins,
          averagePoints: expected.wins > 0 ? expected.points / expected.wins : 0,
          peakScore: expected.peakScore,
          peakProbability: expected.peakProbability,
          peakRoute: expected.peakRoute,
        });
      }
    }

    options.sort((a, b) => {
      if (a.expectedPoints !== b.expectedPoints) return b.expectedPoints - a.expectedPoints;
      if (a.winProbability !== b.winProbability) return b.winProbability - a.winProbability;
      if (a.averagePoints !== b.averagePoints) return b.averagePoints - a.averagePoints;
      if (a.afterShanten !== b.afterShanten) return a.afterShanten - b.afterShanten;
      return a.discard - b.discard;
    });

    return { currentShanten, options, skipped: false, maxDraws };
  }

  function createTileButton(index, {
    onClick,
    disabled = false,
    badge = "",
    titleSuffix = "",
    red = false,
  } = {}) {
    const tile = tileDefinition(index, red);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tile";
    if (red) button.classList.add("red-tile");
    button.disabled = disabled;
    button.title = `${tile.name}${titleSuffix}`;
    button.setAttribute("aria-label", `${tile.name}${titleSuffix}`);

    const image = document.createElement("img");
    image.src = tile.image;
    image.alt = tile.name;
    image.loading = "lazy";
    image.addEventListener("error", () => button.classList.add("image-missing"));
    button.append(image);

    const fallback = document.createElement("span");
    fallback.className = "fallback";
    fallback.textContent = tile.short;
    button.append(fallback);

    if (badge) {
      const badgeNode = document.createElement("span");
      badgeNode.className = "badge";
      badgeNode.textContent = badge;
      button.append(badgeNode);
    }

    if (onClick) button.addEventListener("click", onClick);
    return button;
  }

  function createMiniTile(index, countText = "", red = false) {
    const tile = tileDefinition(index, red);
    const chip = document.createElement("span");
    chip.className = "mini-tile";
    chip.title = tile.name;

    const image = document.createElement("img");
    image.src = tile.image;
    image.alt = tile.name;
    image.loading = "lazy";
    image.addEventListener("error", () => chip.classList.add("image-missing"));
    chip.append(image);

    const fallback = document.createElement("span");
    fallback.className = "fallback";
    fallback.textContent = tile.short;
    chip.append(fallback);

    const label = document.createElement("span");
    label.textContent = countText ? `${tile.short} ${countText}` : tile.short;
    chip.append(label);

    return chip;
  }

  function setError(message = "") {
    const error = document.getElementById("input-error");
    if (!error) return;

    error.textContent = message;
    error.hidden = !message;
  }

  function calculationContext() {
    const fixedRedCounts = redCountsFromMelds(fixedMelds());
    const redCounts = state.redCounts.map((count, index) => count + fixedRedCounts[index]);
    return {
      ...state.settings,
      doraIndicators: state.doraIndicators.slice(),
      redCounts,
      concealedRedCounts: state.redCounts.slice(),
      fixedRedCounts,
      fixedMelds: fixedMelds(),
      usedCounts: allUsedCounts({ includeDrafts: false }),
    };
  }

  function addHandTile(index, red = false) {
    if (totalTiles(state.counts) >= maximumHandSize()) return;
    const used = allUsedCounts();
    if (used[index] >= 4) return;
    const usedRed = allUsedRedCounts();
    if (red && (!isRedTileIndex(index) || usedRed[index] >= 1)) return;

    state.counts[index] += 1;
    if (red) state.redCounts[index] += 1;
  }

  function addOpenTile(index, red = false) {
    const used = allUsedCounts();
    if (used[index] >= 4) return;
    if (red && (!isRedTileIndex(index) || allUsedRedCounts()[index] >= 1)) return;

    if (state.openDraft.length === 0 && canUpgradeLastPon(index)) {
      upgradeLastPonToKan(index, red);
      return;
    }

    if (fixedMeldCount() >= 4) return;
    if (!openDraftCandidateTiles().has(index)) return;

    state.openDraft.push(index);
    state.openDraftRed.push(Boolean(red));
    if (state.openDraft.length < 3) return;

    const meld = openMeldFromThree(state.openDraft, state.openDraftRed);
    if (meld) {
      state.openMelds.push(meld);
      state.openDraft = [];
      state.openDraftRed = [];
    }
  }

  function addClosedKanTile(index, red = false) {
    const used = allUsedCounts();
    if (used[index] !== 0) return;
    if (fixedMeldCount() >= 4) return;

    state.closedKanDraft = [];
    state.closedKans.push(closedKanFromTile(index, red));
  }

  function addDoraTile(index) {
    if (state.doraIndicators.length >= 4) return;
    const used = allUsedCounts();
    if (used[index] >= 4) return;

    state.doraIndicators.push(index);
  }

  function addTileByMode(index, red = false) {
    if (state.inputMode === "hand") addHandTile(index, red);
    else if (state.inputMode === "open") addOpenTile(index, red);
    else if (state.inputMode === "closedKan") addClosedKanTile(index, red);
    else if (state.inputMode === "dora") addDoraTile(index);
  }

  function canClickPaletteTile(index, red = false) {
    const used = allUsedCounts();
    if (used[index] >= 4) return false;
    if (red) {
      if (!isRedTileIndex(index)) return false;
      if (allUsedRedCounts()[index] >= 1) return false;
    }

    if (state.inputMode === "hand") return totalTiles(state.counts) < maximumHandSize();
    if (state.inputMode === "closedKan") {
      if (fixedMeldCount() >= 4) return false;
      if (used[index] !== 0) return false;
      return currentModeCandidateTiles().has(index);
    }

    if (state.inputMode === "dora") {
      return !red && state.doraIndicators.length < 4;
    }

    if (state.inputMode === "open") {
      if (state.openDraft.length === 0 && canUpgradeLastPon(index)) return true;
      if (fixedMeldCount() >= 4) return false;
      return currentModeCandidateTiles().has(index);
    }

    return false;
  }

  function renderModeSwitch() {
    document.querySelectorAll(".mode-button").forEach((button) => {
      const active = button.dataset.mode === state.inputMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderMiniTiles(tiles, redTiles = []) {
    const fragment = document.createDocumentFragment();
    tiles.forEach((tile, index) => {
      fragment.append(createMiniTile(tile, "", Boolean(redTiles[index])));
    });
    return fragment;
  }

  function createMeldCard(meld, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "meld-card";
    button.title = `${meldLabel(meld)}を削除`;
    button.setAttribute("aria-label", `${meldLabel(meld)}を削除`);
    button.append(renderMiniTiles(meld.tiles, meld.redTiles));

    const label = document.createElement("span");
    label.className = "meld-label";
    label.textContent = meldLabel(meld);
    button.append(label);

    button.addEventListener("click", onClick);
    return button;
  }

  function createDoraCard(indicator, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "meld-card";
    button.title = "表ドラを削除";
    button.setAttribute("aria-label", `${TILE_DEFS[indicator].name}の表ドラを削除`);
    button.append(createMiniTile(indicator));

    const label = document.createElement("span");
    label.className = "meld-label";
    label.textContent = `→ ${TILE_DEFS[doraTileFromIndicator(indicator)].short}`;
    button.append(label);

    button.addEventListener("click", onClick);
    return button;
  }

  function renderDraft(container, draft, redDraft, label, onClear) {
    if (!draft.length) return;

    const draftCard = document.createElement("span");
    draftCard.className = "meld-card";
    draftCard.append(renderMiniTiles(draft, redDraft));
    const labelNode = document.createElement("span");
    labelNode.className = "meld-label";
    labelNode.textContent = label;
    draftCard.append(labelNode);
    container.append(draftCard);

    const actions = document.createElement("div");
    actions.className = "draft-actions";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "button secondary";
    clear.textContent = "入力途中をクリア";
    clear.addEventListener("click", onClear);
    actions.append(clear);
    container.append(actions);
  }

  function renderPalette() {
    const palette = document.getElementById("tile-palette");
    if (!palette) return;

    renderModeSwitch();
    palette.replaceChildren();
    const used = allUsedCounts();
    const candidates = currentModeCandidateTiles();

    for (const group of GROUPS) {
      const groupNode = document.createElement("div");
      groupNode.className = "tile-group";

      const groupName = document.createElement("div");
      groupName.className = "group-name";
      groupName.textContent = group.name;
      groupNode.append(groupName);

      const row = document.createElement("div");
      row.className = "tile-row";

      for (let index = group.start; index <= group.end; index += 1) {
        const count = used[index];
        row.append(createTileButton(index, {
          disabled: !candidates.has(index) || !canClickPaletteTile(index, false),
          badge: count ? String(count) : "",
          titleSuffix: "を追加",
          onClick: () => {
            if (!canClickPaletteTile(index, false)) return;
            addTileByMode(index, false);
            renderAll({ syncNotation: true });
          },
        }));

        if (isRedTileIndex(index) && state.inputMode !== "dora") {
          const redUsed = allUsedRedCounts({ includeDrafts: true })[index];
          row.append(createTileButton(index, {
            red: true,
            disabled: !candidates.has(index) || !canClickPaletteTile(index, true),
            badge: redUsed ? "赤" : "",
            titleSuffix: "を追加",
            onClick: () => {
              if (!canClickPaletteTile(index, true)) return;
              addTileByMode(index, true);
              renderAll({ syncNotation: true });
            },
          }));
        }
      }

      groupNode.append(row);
      palette.append(groupNode);
    }
  }

  function renderHand() {
    const hand = document.getElementById("hand-tiles");
    const countNode = document.getElementById("tile-count");
    if (!hand || !countNode) return;

    hand.replaceChildren();
    countNode.textContent = `${totalTiles(state.counts)} / ${requiredHandSize()}〜${maximumHandSize()}`;

    if (totalTiles(state.counts) === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "手牌がありません。上の牌をクリックするか、手牌入力で手牌を作ってください。";
      hand.append(empty);
      return;
    }

    for (let index = 0; index < 34; index += 1) {
      const redCopies = Math.min(state.counts[index], state.redCounts[index] || 0);
      const normalCopies = state.counts[index] - redCopies;
      for (let copy = 0; copy < normalCopies; copy += 1) {
        hand.append(createTileButton(index, {
          titleSuffix: "を外す",
          onClick: () => {
            state.counts[index] -= 1;
            renderAll({ syncNotation: true });
          },
        }));
      }
      for (let copy = 0; copy < redCopies; copy += 1) {
        hand.append(createTileButton(index, {
          red: true,
          titleSuffix: "を外す",
          onClick: () => {
            state.counts[index] -= 1;
            state.redCounts[index] -= 1;
            renderAll({ syncNotation: true });
          },
        }));
      }
    }
  }

  function renderMeldZones() {
    const openNode = document.getElementById("open-melds");
    const closedNode = document.getElementById("closed-kans");

    if (openNode) {
      openNode.replaceChildren();

      if (!state.openMelds.length && !state.openDraft.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "副露モードで牌を順にタップすると、明順・明刻・明槓を追加できます。";
        openNode.append(empty);
      } else {
        state.openMelds.forEach((meld, index) => {
          openNode.append(createMeldCard(meld, () => {
            state.openMelds.splice(index, 1);
            renderAll({ syncNotation: true });
          }));
        });
        renderDraft(openNode, state.openDraft, state.openDraftRed, "入力途中", () => {
          state.openDraft = [];
          state.openDraftRed = [];
          renderAll({ syncNotation: true });
        });
      }
    }

    if (closedNode) {
      closedNode.replaceChildren();

      if (!state.closedKans.length && !state.closedKanDraft.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "暗槓モードで牌を1回タップすると、同じ牌4枚の暗槓として追加できます。";
        closedNode.append(empty);
      } else {
        state.closedKans.forEach((meld, index) => {
          closedNode.append(createMeldCard(meld, () => {
            state.closedKans.splice(index, 1);
            renderAll({ syncNotation: true });
          }));
        });
        renderDraft(closedNode, state.closedKanDraft, [], "入力途中", () => {
          state.closedKanDraft = [];
          renderAll({ syncNotation: true });
        });
      }
    }
  }

  function renderDoraIndicators() {
    const doraNode = document.getElementById("dora-indicators");
    if (!doraNode) return;

    doraNode.replaceChildren();
    if (!state.doraIndicators.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "ドラ表示牌モードで表ドラ表示牌を最大4枚タップできます。";
      doraNode.append(empty);
      return;
    }

    state.doraIndicators.forEach((indicator, index) => {
      doraNode.append(createDoraCard(indicator, () => {
        state.doraIndicators.splice(index, 1);
        renderAll();
      }));
    });
  }

  function renderScoreCell(score, missingText) {
    const wrapper = document.createElement("div");

    if (!score) {
      const muted = document.createElement("span");
      muted.className = "muted";
      muted.textContent = missingText;
      wrapper.append(muted);
      return wrapper;
    }

    const points = document.createElement("span");
    points.className = "points";
    points.textContent = score.display;
    wrapper.append(points);

    const detail = document.createElement("span");
    detail.className = "method-detail";
    if (score.yakumanCount > 0) {
      detail.textContent = score.limitName;
    } else {
      detail.textContent = `${score.han}飜 ${score.fu}符${score.limitName ? ` / ${score.limitName}` : ""}`;
    }
    wrapper.append(detail);

    return wrapper;
  }

  function renderYakuList(score) {
    const list = document.createElement("div");
    list.className = "yaku-list";

    if (!score) {
      const muted = document.createElement("span");
      muted.className = "muted";
      muted.textContent = "役なし";
      list.append(muted);
      return list;
    }

    const entries = score.yakumanCount > 0
      ? score.yakuman.map((item) => `${item.name}${item.count > 1 ? ` ×${item.count}` : ""}`)
      : score.yaku.map((item) => `${item.name} ${item.han}飜`);

    for (const text of entries) {
      const chip = document.createElement("span");
      chip.className = "yaku-chip";
      chip.textContent = text;
      list.append(chip);
    }

    if (score.waitLabel) {
      const chip = document.createElement("span");
      chip.className = "yaku-chip";
      chip.textContent = score.waitLabel;
      list.append(chip);
    }

    if (score.shapeName) {
      const chip = document.createElement("span");
      chip.className = "yaku-chip";
      chip.textContent = score.shapeName;
      list.append(chip);
    }

    return list;
  }

  function formatExpectedPoints(value) {
    return `${Math.round(value).toLocaleString("ja-JP")}点`;
  }

  function formatProbability(value) {
    return `${(value * 100).toFixed(1)}%`;
  }

  function closeAcceptanceDetail() {
    if (!acceptanceDetailLayer) return;

    const layer = acceptanceDetailLayer;
    acceptanceDetailLayer = null;
    layer.classList.remove("open");
    window.setTimeout(() => layer.remove(), 260);
  }

  function acceptanceDetailKind(accept, context) {
    if (accept.shanten < 0) return "和了";
    if (!accept.shapeImprovement) return "向聴減";

    const doraTiles = new Set(
      (context.doraIndicators || []).map((indicator) => doraTileFromIndicator(indicator)),
    );
    if (accept.scoreImprovement || accept.drawRed || doraTiles.has(accept.tile)) return "打点増";
    return "受入増";
  }

  function showAcceptanceDetail(option, context) {
    closeAcceptanceDetail();

    const backdrop = document.createElement("div");
    backdrop.className = "acceptance-drawer-backdrop";
    backdrop.setAttribute("aria-label", "受け入れ詳細を閉じる");

    const drawer = document.createElement("section");
    drawer.className = "acceptance-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-labelledby", "acceptance-drawer-title");

    const handle = document.createElement("div");
    handle.className = "drawer-handle";
    handle.setAttribute("aria-hidden", "true");
    drawer.append(handle);

    const header = document.createElement("div");
    header.className = "drawer-header";

    const headingWrap = document.createElement("div");
    const heading = document.createElement("h3");
    heading.id = "acceptance-drawer-title";
    heading.textContent = "受け入れ詳細";
    headingWrap.append(heading);

    const subtitle = document.createElement("p");
    subtitle.className = "drawer-subtitle";
    const discard = tileDefinition(option.discard, option.discardRed);
    subtitle.textContent = `${discard.short}切り / 合計 ${option.totalAcceptance}枚`;
    headingWrap.append(subtitle);
    header.append(headingWrap);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "drawer-close";
    closeButton.setAttribute("aria-label", "閉じる");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", closeAcceptanceDetail);
    header.append(closeButton);
    drawer.append(header);

    const list = document.createElement("div");
    list.className = "acceptance-detail-list";
    const detailOrder = { "和了": 0, "向聴減": 1, "受入増": 2, "打点増": 3 };
    const accepts = option.accepts
      .slice()
      .sort((a, b) => (
        detailOrder[acceptanceDetailKind(a, context)]
        - detailOrder[acceptanceDetailKind(b, context)]
        || a.tile - b.tile
        || Number(a.drawRed) - Number(b.drawRed)
      ));

    if (!accepts.length) {
      const empty = document.createElement("p");
      empty.className = "acceptance-detail-empty";
      empty.textContent = "受け入れ牌がありません。";
      list.append(empty);
    } else {
      for (const accept of accepts) {
        const item = document.createElement("div");
        item.className = "acceptance-detail-item";
        item.append(createMiniTile(accept.tile, `${accept.remaining}枚`, accept.drawRed));

        const kind = document.createElement("span");
        kind.className = "acceptance-detail-kind";
        kind.textContent = acceptanceDetailKind(accept, context);
        item.append(kind);
        list.append(item);
      }
    }
    drawer.append(list);
    backdrop.append(drawer);

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeAcceptanceDetail();
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAcceptanceDetail();
      }
    });

    document.body.append(backdrop);
    acceptanceDetailLayer = backdrop;
    window.requestAnimationFrame(() => {
      backdrop.classList.add("open");
      closeButton.focus();
    });
  }

  function renderExpectedValueResult(result, context) {
    const section = document.createDocumentFragment();
    const current = result.currentShanten;

    if (result.skipped) {
      const summary = document.createElement("div");
      summary.className = "summary";

      const score = document.createElement("div");
      score.className = "score-card";
      score.innerHTML = `
        <div class="score-label">現在の牌姿</div>
        <div class="score-value">${formatShantenText(current.shanten)}</div>
        <div class="score-sub">期待値比較は ${EV_MAX_SHANTEN}シャンテン以内が対象です</div>
      `;
      summary.append(score);

      const note = document.createElement("div");
      note.className = "note-card";
      note.innerHTML = `
        <strong>今回は探索対象外です。</strong><br>
        遠い牌姿は分岐が大きくなるため、${EV_MAX_SHANTEN}シャンテン以内で計算します。
      `;
      summary.append(note);
      section.append(summary);
      return section;
    }

    const best = result.options[0];
    const summary = document.createElement("div");
    summary.className = "summary";

    const score = document.createElement("div");
    score.className = "score-card";
    const bestDiscardLabel = tileDefinition(best.discard, best.discardRed).short;
    score.innerHTML = `
      <div class="score-label">最良打牌</div>
      <div class="score-value">${bestDiscardLabel}</div>
      <div class="score-sub">${formatExpectedPoints(best.expectedPoints)} / 和了確率 ${formatProbability(best.winProbability)}</div>
    `;
    summary.append(score);

    const note = document.createElement("div");
    note.className = "note-card";
    note.innerHTML = `
      <strong>${formatShantenText(current.shanten)}の14枚を比較しています。</strong><br>
      残り12巡、副露なしで確率を計算しています。シャンテン数を下げない打点上昇牌も採用します。
      期待得点は各ルートの <strong>和了確率 × ツモ時の受取点</strong> を比較した値です。受け入れ枚数はシャンテン数を下げる牌と、同じシャンテン数でも次の受け入れ枚数を増やす牌を数えています。
    `;
    summary.append(note);
    section.append(summary);

    const tableWrap = document.createElement("div");
    tableWrap.className = "result-table-wrap";
    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr>
          <th>打牌</th>
          <th>打牌後</th>
          <th>受け入れ</th>
          <th>期待得点</th>
          <th>和了確率</th>
          <th>平均打点</th>
          <th>最高打点ルート</th>
        </tr>
      </thead>
    `;
    const tbody = document.createElement("tbody");

    for (const [index, option] of result.options.entries()) {
      const row = document.createElement("tr");
      if (index === 0) row.className = "best";

      const discardCell = document.createElement("td");
      discardCell.className = "discard-cell";
      discardCell.append(createMiniTile(option.discard, "", option.discardRed));
      row.append(discardCell);

      const shantenCell = document.createElement("td");
      shantenCell.textContent = formatShantenText(option.afterShanten);
      row.append(shantenCell);

      const acceptanceCell = document.createElement("td");
      acceptanceCell.className = "ukeire-count";
      const acceptanceButton = document.createElement("button");
      acceptanceButton.type = "button";
      acceptanceButton.className = "ukeire-button";
      acceptanceButton.textContent = `${option.totalAcceptance}枚`;
      acceptanceButton.setAttribute("aria-label", `受け入れ詳細 ${option.totalAcceptance}枚`);
      acceptanceButton.addEventListener("click", () => showAcceptanceDetail(option, context));
      acceptanceCell.append(acceptanceButton);
      row.append(acceptanceCell);

      const expectedCell = document.createElement("td");
      const expectedPoints = document.createElement("span");
      expectedPoints.className = "points";
      expectedPoints.textContent = formatExpectedPoints(option.expectedPoints);
      expectedCell.append(expectedPoints);
      row.append(expectedCell);

      const probabilityCell = document.createElement("td");
      probabilityCell.textContent = formatProbability(option.winProbability);
      row.append(probabilityCell);

      const averageCell = document.createElement("td");
      averageCell.textContent = option.winProbability > 0
        ? formatExpectedPoints(option.averagePoints)
        : "—";
      row.append(averageCell);

      const routeCell = document.createElement("td");
      routeCell.append(renderYakuList(option.peakRoute));
      row.append(routeCell);

      tbody.append(row);
    }

    table.append(tbody);
    tableWrap.append(table);
    section.append(tableWrap);
    return section;
  }

  function needsExpectedValueCalculation() {
    const total = totalTiles(state.counts);
    const required = requiredHandSize();
    const maximum = maximumHandSize();
    return total === maximum && maximum !== required;
  }

  function renderResultLoading() {
    const result = document.getElementById("result");
    if (!result) return;

    result.setAttribute("aria-busy", "true");
    result.replaceChildren();

    const title = document.createElement("h2");
    title.textContent = "計算結果";
    result.append(title);

    const loading = document.createElement("div");
    loading.className = "loading-card";
    loading.setAttribute("role", "status");
    loading.innerHTML = `
      <div class="loading-spinner" aria-hidden="true"></div>
      <div>
        <strong>計算中です…</strong>
        <p>12回のツモを確率計算しています。</p>
      </div>
    `;
    result.append(loading);
  }

  function renderResult() {
    const result = document.getElementById("result");
    if (!result) return;

    result.setAttribute("aria-busy", "false");
    result.replaceChildren();
    const total = totalTiles(state.counts);
    const required = requiredHandSize();
    const maximum = maximumHandSize();

    const title = document.createElement("h2");
    title.textContent = "計算結果";
    result.append(title);

    if (hasIncompleteDraft()) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "副露または暗槓の入力途中があります。完成させるか、入力途中をクリアしてください。";
      result.append(empty);
      return;
    }

    const context = calculationContext();

    if (total === maximum && maximum !== required) {
      const expected = analyzeExpectedValue(state.counts, context);
      result.append(renderExpectedValueResult(expected, context));
      return;
    }

    if (total !== required) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = `${required}枚で点数計算、${maximum}枚で打牌の期待値を計算します。現在は ${total} 枚です。`;
      result.append(empty);
      return;
    }

    const waits = analyzeTenpai(state.counts, context);

    if (!waits.length) {
      const summary = document.createElement("div");
      summary.className = "summary";

      const score = document.createElement("div");
      score.className = "score-card";
      score.innerHTML = `
        <div class="score-label">現在の手牌</div>
        <div class="score-value">ノーテン</div>
        <div class="score-sub">完成する和了牌がありません</div>
      `;
      summary.append(score);

      const note = document.createElement("div");
      note.className = "note-card";
      note.innerHTML = `
        <strong>テンパイしていません。</strong><br>
        手牌に1枚足して和了形になる牌が見つかりませんでした。
      `;
      summary.append(note);
      result.append(summary);
      return;
    }

    const totalRemaining = waits.reduce((sum, wait) => sum + wait.remaining, 0);
    const bestRon = bestScore(waits.map((wait) => wait.ron).filter(Boolean));
    const bestTsumo = bestScore(waits.map((wait) => wait.tsumo).filter(Boolean));

    const summary = document.createElement("div");
    summary.className = "summary";

    const score = document.createElement("div");
    score.className = "score-card";
    score.innerHTML = `
      <div class="score-label">現在の手牌</div>
      <div class="score-value">テンパイ</div>
      <div class="score-sub">待ち ${waits.length}種 / 残り ${totalRemaining}枚</div>
    `;
    summary.append(score);

    const note = document.createElement("div");
    note.className = "note-card";
    note.innerHTML = `
      <strong>計算範囲:</strong> 親/子は自風で判定します。裏ドラと一発はサポート外です。ロンとツモを個別に表示します。
      ${bestRon ? `<br>最高ロン: <strong>${bestRon.display}</strong>` : ""}
      ${bestTsumo ? `<br>最高ツモ: <strong>${bestTsumo.display}</strong>` : ""}
    `;
    summary.append(note);
    result.append(summary);

    const tableWrap = document.createElement("div");
    tableWrap.className = "result-table-wrap";
    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr>
          <th>和了牌</th>
          <th>残り</th>
          <th>ロン</th>
          <th>ツモ</th>
          <th>採用役</th>
        </tr>
      </thead>
    `;
    const tbody = document.createElement("tbody");

    for (const wait of waits) {
      const row = document.createElement("tr");

      const waitCell = document.createElement("td");
      waitCell.className = "wait-cell";
      waitCell.append(createMiniTile(wait.tile));
      if (wait.red) {
        const redNote = document.createElement("span");
        redNote.className = "pill";
        redNote.textContent = `赤${wait.red.remaining}枚`;
        waitCell.append(redNote);
      }
      row.append(waitCell);

      const remainingCell = document.createElement("td");
      remainingCell.className = "ukeire-count";
      remainingCell.textContent = `${wait.remaining}枚`;
      row.append(remainingCell);

      const ronCell = document.createElement("td");
      ronCell.append(renderScoreCell(wait.ron, "役なしでロン不可"));
      row.append(ronCell);

      const tsumoCell = document.createElement("td");
      tsumoCell.append(renderScoreCell(wait.tsumo, "ツモ不可"));
      row.append(tsumoCell);

      const yakuCell = document.createElement("td");
      yakuCell.append(renderYakuList(wait.ron || wait.tsumo));
      row.append(yakuCell);

      tbody.append(row);
    }

    table.append(tbody);
    tableWrap.append(table);
    result.append(tableWrap);
  }

  function syncSettingsFromControls() {
    const roundWind = document.getElementById("round-wind");
    const seatWind = document.getElementById("seat-wind");
    const riichi = document.getElementById("riichi");

    if (roundWind) state.settings.roundWind = Number(roundWind.value);
    if (seatWind) state.settings.seatWind = Number(seatWind.value);
    if (riichi) state.settings.riichi = riichi.checked;
  }

  function renderAll({ syncNotation = false } = {}) {
    closeAcceptanceDetail();
    syncSettingsFromControls();

    if (syncNotation) {
      const notation = document.getElementById("notation");
      if (notation) notation.value = toNotation(state.counts, state.redCounts);
    }

    setError("");
    renderPalette();
    renderHand();
    renderMeldZones();
    renderDoraIndicators();

    const renderToken = ++resultRenderToken;
    if (!needsExpectedValueCalculation()) {
      renderResult();
      return;
    }

    renderResultLoading();
    window.setTimeout(() => {
      if (renderToken !== resultRenderToken) return;
      renderResult();
    }, 0);
  }

  function bindControls() {
    const notation = document.getElementById("notation");
    const applyButton = document.getElementById("apply-notation");
    const clearButton = document.getElementById("clear-hand");
    const sampleButton = document.getElementById("sample-hand");
    const roundWind = document.getElementById("round-wind");
    const seatWind = document.getElementById("seat-wind");
    const riichi = document.getElementById("riichi");
    const modeButtons = document.querySelectorAll(".mode-button");

    const applyNotation = () => {
      try {
        const nextCounts = parseNotation(notation.value, { maxTiles: maximumHandSize() });
        const nextRedCounts = redCountsFromNotation(notation.value);
        validateTileUsage(allUsedCounts({ extraClosedCounts: nextCounts }));
        validateRedUsage(
          nextRedCounts,
          allUsedRedCounts({ extraClosedRedCounts: Array(34).fill(0) }),
        );
        state.counts = nextCounts;
        state.redCounts = nextRedCounts;
        renderAll({ syncNotation: true });
      } catch (error) {
        setError(error.message);
      }
    };

    applyButton.addEventListener("click", applyNotation);
    notation.addEventListener("keydown", (event) => {
      if (event.key === "Enter") applyNotation();
    });

    clearButton.addEventListener("click", () => {
      state.counts = Array(34).fill(0);
      state.redCounts = Array(34).fill(0);
      state.openMelds = [];
      state.closedKans = [];
      state.doraIndicators = [];
      state.openDraft = [];
      state.openDraftRed = [];
      state.closedKanDraft = [];
      renderAll({ syncNotation: true });
    });

    sampleButton.addEventListener("click", () => {
      state.openMelds = [];
      state.closedKans = [];
      state.doraIndicators = [];
      state.openDraft = [];
      state.openDraftRed = [];
      state.closedKanDraft = [];
      state.redCounts = Array(34).fill(0);
      state.counts = generateSanshokuExample();
      renderAll({ syncNotation: true });
    });

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.mode && INPUT_MODES[button.dataset.mode]) {
          state.inputMode = button.dataset.mode;
          renderAll();
        }
      });
    });

    for (const control of [roundWind, seatWind, riichi]) {
      if (control) control.addEventListener("change", () => renderAll());
    }
  }

  function firstQueryValue(params, names) {
    for (const name of names) {
      if (params.has(name)) return params.get(name);
    }
    return null;
  }

  function parseWindParameter(value, fallback) {
    if (value === null || value.trim() === "") return fallback;

    const normalized = value.trim().replace(/[場家]$/, "");
    const values = {
      東: 27,
      南: 28,
      西: 29,
      北: 30,
      "1z": 27,
      "2z": 28,
      "3z": 29,
      "4z": 30,
      "27": 27,
      "28": 28,
      "29": 29,
      "30": 30,
    };
    if (values[normalized] !== undefined) return values[normalized];
    throw new Error(`風の指定「${value}」を読み取れません。東/南/西/北 または 1z〜4z を指定してください。`);
  }

  function parseRiichiParameter(value) {
    if (value === null || value.trim() === "") return false;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "on", "yes", "リーチ"].includes(normalized)) return true;
    if (["0", "false", "off", "no"].includes(normalized)) return false;
    throw new Error(`リーチの指定「${value}」を読み取れません。1 または 0 を指定してください。`);
  }

  function redFlagsFromNotation(notation, tiles) {
    const redCounts = redCountsFromNotation(notation);
    validateRedUsage(redCounts);
    return tiles.map((tile) => {
      if (!redCounts[tile]) return false;
      redCounts[tile] -= 1;
      return true;
    });
  }

  function parseOpenMeldsParameter(value) {
    if (value === null || value.trim() === "") return [];

    return value.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
      const counts = parseNotation(part, { maxTiles: 4 });
      const tileCount = totalTiles(counts);
      if (tileCount !== 3 && tileCount !== 4) {
        throw new Error(`副露「${part}」は3枚または4枚で指定してください。`);
      }
      const tiles = tilesFromCounts(counts);
      const redTiles = redFlagsFromNotation(part, tiles);
      const meld = tileCount === 4
        ? (tiles.every((tile) => tile === tiles[0])
          ? openKanFromTile(tiles[0], redTiles[0])
          : null)
        : openMeldFromThree(tiles, redTiles);
      if (!meld) {
        throw new Error(`副露「${part}」は明順・明刻・明槓として読み取れません。`);
      }
      return meld;
    });
  }

  function parseClosedKansParameter(value) {
    if (value === null || value.trim() === "") return [];

    return value.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
      const counts = parseNotation(part, { maxTiles: 1 });
      if (totalTiles(counts) !== 1) {
        throw new Error(`暗槓「${part}」は牌1枚で指定してください。`);
      }
      const tiles = tilesFromCounts(counts);
      const redTiles = redFlagsFromNotation(part, tiles);
      return closedKanFromTile(tiles[0], redTiles[0]);
    });
  }

  function loadNotationFromQuery() {
    if (typeof window === "undefined" || !window.location) return "";

    const params = new URLSearchParams(window.location.search);
    try {
      const nextOpenMelds = parseOpenMeldsParameter(
        firstQueryValue(params, ["open", "furo"]),
      );
      const nextClosedKans = parseClosedKansParameter(
        firstQueryValue(params, ["kan", "ankan"]),
      );
      if (nextOpenMelds.length + nextClosedKans.length > 4) {
        throw new Error("副露と暗槓は合計4組まで指定できます。");
      }

      const nextDoraNotation = firstQueryValue(params, ["dora", "d"]);
      const nextDoraCounts = nextDoraNotation === null
        ? Array(34).fill(0)
        : parseNotation(nextDoraNotation, { maxTiles: 4 });
      const nextDoraRedCounts = nextDoraNotation === null
        ? Array(34).fill(0)
        : redCountsFromNotation(nextDoraNotation);
      if (totalTiles(nextDoraRedCounts) > 0) {
        throw new Error("ドラ表示牌に赤牌は指定できません。");
      }
      const nextDoraIndicators = tilesFromCounts(nextDoraCounts);

      const maxTiles = DRAW_HAND_SIZE - (nextOpenMelds.length + nextClosedKans.length) * 3;
      const notation = params.has("p") ? params.get("p") || "" : "";
      const nextCounts = parseNotation(notation, { maxTiles });
      const nextRedCounts = redCountsFromNotation(notation);
      const usedCounts = cloneCounts(nextCounts);
      for (const meld of [...nextOpenMelds, ...nextClosedKans]) {
        addTilesToCounts(usedCounts, meld.tiles);
      }
      addTilesToCounts(usedCounts, nextDoraIndicators);
      validateTileUsage(usedCounts);
      validateRedUsage(nextRedCounts, redCountsFromMelds([...nextOpenMelds, ...nextClosedKans]));

      const roundWind = parseWindParameter(
        firstQueryValue(params, ["round", "roundWind", "rw"]),
        27,
      );
      const seatWind = parseWindParameter(
        firstQueryValue(params, ["seat", "seatWind", "sw"]),
        28,
      );
      const riichi = parseRiichiParameter(
        firstQueryValue(params, ["riichi", "r"]),
      );

      state.counts = nextCounts;
      state.redCounts = nextRedCounts;
      state.openMelds = nextOpenMelds;
      state.closedKans = nextClosedKans;
      state.doraIndicators = nextDoraIndicators;
      state.openDraft = [];
      state.openDraftRed = [];
      state.closedKanDraft = [];
      state.settings.roundWind = roundWind;
      state.settings.seatWind = seatWind;
      state.settings.riichi = riichi;

      const roundWindControl = document.getElementById("round-wind");
      const seatWindControl = document.getElementById("seat-wind");
      const riichiControl = document.getElementById("riichi");
      if (roundWindControl) roundWindControl.value = String(roundWind);
      if (seatWindControl) seatWindControl.value = String(seatWind);
      if (riichiControl) riichiControl.checked = riichi;

      return "";
    } catch (error) {
      return `URLパラメータを読み込めませんでした: ${error.message}`;
    }
  }

  function buildPermalink() {
    if (typeof window === "undefined" || !window.location) return "";

    syncSettingsFromControls();
    const url = new URL(window.location.href);
    const params = new URLSearchParams();
    const notation = toNotation(state.counts, state.redCounts);
    const doraNotation = toNotation(tileCountsFromTiles(state.doraIndicators));
    const openNotation = state.openMelds
      .map((meld) => toNotation(
        tileCountsFromTiles(meld.tiles),
        redCountsFromMelds([meld]),
      ))
      .join(",");
    const kanNotation = state.closedKans
      .map((meld) => toNotation(
        tileCountsFromTiles([meld.tile]),
        redCountsFromMelds([meld]),
      ))
      .join(",");

    if (notation) params.set("p", notation);
    if (doraNotation) params.set("dora", doraNotation);
    if (openNotation) params.set("open", openNotation);
    if (kanNotation) params.set("kan", kanNotation);
    if (state.settings.roundWind !== 27) {
      params.set("round", `${state.settings.roundWind - 26}z`);
    }
    if (state.settings.seatWind !== 28) {
      params.set("seat", `${state.settings.seatWind - 26}z`);
    }
    if (state.settings.riichi) params.set("riichi", "1");

    url.search = params.toString();
    url.hash = "";
    return url.href;
  }

  async function writeClipboardText(text) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        // file:// などでClipboard APIが使えない場合は下の方法を試します。
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("コピーできませんでした。");
  }

  function bindPermalinkControl() {
    const button = document.getElementById("copy-permalink");
    if (!button) return;

    button.addEventListener("click", async () => {
      const originalText = "リンクをコピー";
      try {
        await writeClipboardText(buildPermalink());
        button.textContent = "コピーしました";
      } catch (error) {
        button.textContent = "コピーに失敗しました";
      }
      window.setTimeout(() => {
        button.textContent = originalText;
      }, 1800);
    });
  }

  function init() {
    bindControls();
    bindPermalinkControl();
    const queryError = loadNotationFromQuery();
    renderAll({ syncNotation: true });
    if (queryError) setError(queryError);
  }

  const publicApi = {
    TILE_DEFS,
    HAND_SIZE,
    RED_TILE_IMAGES,
    isRedTileIndex,
    doraTileFromIndicator,
    doraCountForCounts,
    parseNotation,
    redCountsFromNotation,
    toNotation,
    getWinningPatterns,
    analyzeTenpai,
    scoreWinningTile,
    scorePattern,
    minShanten,
    analyzeExpectedValue,
    generateSanshokuExample,
    sanshokuPotentials,
    isKokushi,
    isChiitoitsu,
    decomposeStandard,
    openMeldFromThree,
    closedKanFromTile,
  };

  if (typeof window !== "undefined") {
    window.MahjongScore = publicApi;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = publicApi;
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
