(() => {
  "use strict";

  const HAND_SIZE = 13;

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

  const SAMPLE_HANDS = [
    "123m123p123s45s33z",
    "112233m445566p7s",
    "19m19p19s1234567z",
    "123m123p45s東東東77z",
    "223344m223344p5s",
  ];

  const state = {
    counts: Array(34).fill(0),
    sampleIndex: 0,
    settings: {
      roundWind: 27,
      seatWind: 28,
      riichi: false,
      dora: 0,
    },
  };

  function totalTiles(counts) {
    return counts.reduce((sum, count) => sum + count, 0);
  }

  function cloneCounts(counts) {
    return counts.slice();
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

  function parseNotation(text, { maxTiles = HAND_SIZE } = {}) {
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

  function toNotation(counts) {
    const parts = [];

    for (const [offset, suit] of [[0, "m"], [9, "p"], [18, "s"]]) {
      let digits = "";
      for (let i = 0; i < 9; i += 1) {
        digits += String(i + 1).repeat(counts[offset + i]);
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

  function decomposeStandard(counts) {
    if (totalTiles(counts) !== 14) return [];

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
        if (melds.length === 4) return [melds.slice()];
        return [];
      }

      const results = [];

      if (work[first] >= 3) {
        work[first] -= 3;
        results.push(...extractMelds(work, [
          ...melds,
          { type: "triplet", tile: first, tiles: [first, first, first] },
        ]));
        work[first] += 3;
      }

      if (canStartSequence(first) && work[first + 1] > 0 && work[first + 2] > 0) {
        work[first] -= 1;
        work[first + 1] -= 1;
        work[first + 2] -= 1;
        results.push(...extractMelds(work, [
          ...melds,
          { type: "sequence", base: first, tiles: [first, first + 1, first + 2] },
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
        patterns.push({ type: "standard", pair, melds });
      }
    }

    return patterns;
  }

  function getWinningPatterns(counts) {
    const patterns = [];
    if (isKokushi(counts)) patterns.push({ type: "kokushi" });
    if (isChiitoitsu(counts)) patterns.push({ type: "chiitoitsu" });
    patterns.push(...decomposeStandard(counts));
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

    if (context.riichi) yaku.push({ name: "リーチ", han: 1 });
    if (isTsumo) yaku.push({ name: "門前清自摸和", han: 1 });
    if (allTilesSatisfy(counts, isSimple)) yaku.push({ name: "断么九", han: 1 });

    const { suits, hasHonors } = getSuitsInfo(counts);
    if (suits.size === 1 && hasHonors) yaku.push({ name: "混一色", han: 3 });
    if (suits.size === 1 && !hasHonors) yaku.push({ name: "清一色", han: 6 });

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

  function evaluateStandard(counts, pattern, context, winningTile, isTsumo, variant) {
    const yaku = commonClosedYaku(counts, context, isTsumo);
    const yakuman = commonYakuman(counts);

    const sequenceMelds = pattern.melds.filter((meld) => meld.type === "sequence");
    const tripletMelds = pattern.melds.filter((meld) => meld.type === "triplet");
    const allSequences = sequenceMelds.length === 4;
    const allTriplets = tripletMelds.length === 4;

    const sequenceCounts = new Map();
    for (const meld of sequenceMelds) {
      const key = sequenceKey(meld);
      sequenceCounts.set(key, (sequenceCounts.get(key) || 0) + 1);
    }

    const doubleSequenceCount = [...sequenceCounts.values()].filter((count) => count >= 2).length;
    if (doubleSequenceCount >= 2) {
      yaku.push({ name: "二盃口", han: 3 });
    } else if (doubleSequenceCount === 1) {
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

    if (allSequences && pairFu(pattern.pair, context) === 0 && variant.kind === "sequence" && variant.ryanmen) {
      yaku.push({ name: "平和", han: 1 });
    }

    if (allTriplets) yaku.push({ name: "対々和", han: 2 });

    const concealedTriplets = tripletMelds.filter((meld, meldIndexInTriplets) => {
      const originalIndex = pattern.melds.indexOf(meld);
      const ronOpenedTriplet = !isTsumo && variant.kind === "triplet" && variant.meldIndex === originalIndex;
      return !ronOpenedTriplet && meldIndexInTriplets >= 0;
    }).length;

    if (concealedTriplets >= 3) yaku.push({ name: "三暗刻", han: 2 });

    const sequenceBases = new Set(sequenceMelds.map((meld) => meld.base));
    for (let numberOffset = 0; numberOffset <= 6; numberOffset += 1) {
      if (
        sequenceBases.has(numberOffset) &&
        sequenceBases.has(9 + numberOffset) &&
        sequenceBases.has(18 + numberOffset)
      ) {
        yaku.push({ name: "三色同順", han: 2 });
        break;
      }
    }

    for (const offset of [0, 9, 18]) {
      if (sequenceBases.has(offset) && sequenceBases.has(offset + 3) && sequenceBases.has(offset + 6)) {
        yaku.push({ name: "一気通貫", han: 2 });
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
    const hasHonor = Object.keys(counts).some((key) => counts[Number(key)] > 0 && isHonor(Number(key)));

    if (allTilesSatisfy(counts, isTerminalOrHonor)) yaku.push({ name: "混老頭", han: 2 });
    if (hasSequence && everyGroupHasTerminal && !hasHonor) {
      yaku.push({ name: "純全帯么九", han: 3 });
    } else if (hasSequence && everyGroupHasTerminalOrHonor) {
      yaku.push({ name: "混全帯么九", han: 2 });
    }

    if (dragonTriplets === 3) yakuman.push({ name: "大三元", count: 1 });
    if (windTriplets === 3 && isWind(pattern.pair)) yakuman.push({ name: "小四喜", count: 1 });
    if (windTriplets === 4) yakuman.push({ name: "大四喜", count: 1 });
    if (concealedTriplets === 4) yakuman.push({ name: "四暗刻", count: 1 });

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
      if (meld.type !== "triplet") continue;

      const terminalOrHonor = isTerminalOrHonor(meld.tile);
      const openByRon = !isTsumo && variant.kind === "triplet" && variant.meldIndex === meldIndex;

      if (openByRon) fu += terminalOrHonor ? 4 : 2;
      else fu += terminalOrHonor ? 8 : 4;
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

  function buildScore({ context, isTsumo, fu, yaku, yakuman, shapeName, waitLabel = "" }) {
    const isDealer = context.seatWind === 27;
    const yakumanCount = yakuman.reduce((sum, item) => sum + item.count, 0);
    const dora = Math.max(0, Math.min(12, Math.trunc(Number(context.dora) || 0)));
    const baseHan = yaku.reduce((sum, item) => sum + item.han, 0);
    const scoredYaku = yakumanCount > 0 || dora === 0
      ? yaku
      : [...yaku, { name: "ドラ", han: dora }];
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
    const counts = addTile(originalCounts, winningTile);
    const patterns = getWinningPatterns(counts);
    if (!patterns.length) return null;

    const ronScores = [];
    const tsumoScores = [];

    for (const pattern of patterns) {
      const ron = scorePattern(counts, pattern, context, winningTile, false);
      const tsumo = scorePattern(counts, pattern, context, winningTile, true);
      if (ron) ronScores.push(ron);
      if (tsumo) tsumoScores.push(tsumo);
    }

    return {
      tile: winningTile,
      remaining: 4 - originalCounts[winningTile],
      ron: bestScore(ronScores),
      tsumo: bestScore(tsumoScores),
      patternCount: patterns.length,
    };
  }

  function bestScore(scores) {
    if (!scores.length) return null;
    return scores.slice().sort((a, b) => {
      if (a.total !== b.total) return b.total - a.total;
      if (a.yakumanCount !== b.yakumanCount) return b.yakumanCount - a.yakumanCount;
      if (a.han !== b.han) return b.han - a.han;
      if (a.fu !== b.fu) return b.fu - a.fu;
      return 0;
    })[0];
  }

  function analyzeTenpai(counts, context = state.settings) {
    const waits = [];

    for (let tile = 0; tile < 34; tile += 1) {
      if (counts[tile] >= 4) continue;
      const result = scoreWinningTile(counts, tile, context);
      if (result) waits.push(result);
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

  function createTileButton(index, { onClick, disabled = false, badge = "", titleSuffix = "" } = {}) {
    const tile = TILE_DEFS[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tile";
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

  function createMiniTile(index, countText = "") {
    const tile = TILE_DEFS[index];
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

  function renderPalette() {
    const palette = document.getElementById("tile-palette");
    if (!palette) return;

    palette.replaceChildren();
    const total = totalTiles(state.counts);

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
        const count = state.counts[index];
        row.append(createTileButton(index, {
          disabled: total >= HAND_SIZE || count >= 4,
          badge: count ? String(count) : "",
          titleSuffix: "を追加",
          onClick: () => {
            if (totalTiles(state.counts) >= HAND_SIZE || state.counts[index] >= 4) return;
            state.counts[index] += 1;
            renderAll({ syncNotation: true });
          },
        }));
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
    countNode.textContent = String(totalTiles(state.counts));

    if (totalTiles(state.counts) === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "まだ牌がありません。上の牌をクリックするか、文字入力で手牌を入れてください。";
      hand.append(empty);
      return;
    }

    for (let index = 0; index < 34; index += 1) {
      for (let copy = 0; copy < state.counts[index]; copy += 1) {
        hand.append(createTileButton(index, {
          titleSuffix: "を外す",
          onClick: () => {
            state.counts[index] -= 1;
            renderAll({ syncNotation: true });
          },
        }));
      }
    }
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

  function renderResult() {
    const result = document.getElementById("result");
    if (!result) return;

    result.replaceChildren();
    const total = totalTiles(state.counts);

    const title = document.createElement("h2");
    title.textContent = "計算結果";
    result.append(title);

    if (total !== HAND_SIZE) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = `${HAND_SIZE}枚ちょうど選ぶと計算します。現在は ${total} 枚です。`;
      result.append(empty);
      return;
    }

    const waits = analyzeTenpai(state.counts, state.settings);

    if (!waits.length) {
      const summary = document.createElement("div");
      summary.className = "summary";

      const score = document.createElement("div");
      score.className = "score-card";
      score.innerHTML = `
        <div class="score-label">現在の手牌</div>
        <div class="score-value">非テンパイ</div>
        <div class="score-sub">完成する和了牌がありません</div>
      `;
      summary.append(score);

      const note = document.createElement("div");
      note.className = "note-card";
      note.innerHTML = `
        <strong>テンパイしていません。</strong><br>
        13枚に1枚足して通常手・七対子・国士無双の和了形になる牌が見つかりませんでした。
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
      <strong>計算範囲:</strong> 門前手・副露なし。ドラは入力枚数を飜数に加算します。親/子は自風で判定します。<br>
      最高点になる和了形を自動で選び、ロンとツモを別々に表示します。
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
    const doraCount = document.getElementById("dora-count");

    if (roundWind) state.settings.roundWind = Number(roundWind.value);
    if (seatWind) state.settings.seatWind = Number(seatWind.value);
    if (riichi) state.settings.riichi = riichi.checked;
    if (doraCount) {
      const value = Math.max(0, Math.min(12, Math.trunc(Number(doraCount.value) || 0)));
      state.settings.dora = value;
      if (String(value) !== doraCount.value) doraCount.value = String(value);
    }
  }

  function renderAll({ syncNotation = false } = {}) {
    syncSettingsFromControls();

    if (syncNotation) {
      const notation = document.getElementById("notation");
      if (notation) notation.value = toNotation(state.counts);
    }

    setError("");
    renderPalette();
    renderHand();
    renderResult();
  }

  function bindControls() {
    const notation = document.getElementById("notation");
    const applyButton = document.getElementById("apply-notation");
    const clearButton = document.getElementById("clear-hand");
    const sampleButton = document.getElementById("sample-hand");
    const roundWind = document.getElementById("round-wind");
    const seatWind = document.getElementById("seat-wind");
    const riichi = document.getElementById("riichi");
    const doraCount = document.getElementById("dora-count");

    const applyNotation = () => {
      try {
        state.counts = parseNotation(notation.value, { maxTiles: HAND_SIZE });
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
      renderAll({ syncNotation: true });
    });

    sampleButton.addEventListener("click", () => {
      const sample = SAMPLE_HANDS[state.sampleIndex % SAMPLE_HANDS.length];
      state.sampleIndex += 1;
      state.counts = parseNotation(sample, { maxTiles: HAND_SIZE });
      renderAll({ syncNotation: true });
    });

    for (const control of [roundWind, seatWind, riichi, doraCount]) {
      if (control) control.addEventListener("change", () => renderAll());
    }
    if (doraCount) doraCount.addEventListener("input", () => renderAll());
  }

  function init() {
    bindControls();
    renderAll({ syncNotation: true });
  }

  const publicApi = {
    TILE_DEFS,
    HAND_SIZE,
    parseNotation,
    toNotation,
    getWinningPatterns,
    analyzeTenpai,
    scoreWinningTile,
    scorePattern,
    isKokushi,
    isChiitoitsu,
    decomposeStandard,
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
