(() => {
  "use strict";

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

  const TERMINALS_AND_HONORS = [
    0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33,
  ];

  const SAMPLE_HANDS = [
    "234m345m456p67s東東中",
    "123m456p789s東南西北白",
    "112233m4455p66s東東",
    "119m19p19s1234567z",
    "345m456p234s55z678s",
  ];

  const state = {
    counts: Array(34).fill(0),
    sampleIndex: 0,
  };

  const minShantenMemo = new Map();
  const normalShantenMemo = new Map();

  function totalTiles(counts) {
    return counts.reduce((sum, count) => sum + count, 0);
  }

  function cloneCounts(counts) {
    return counts.slice();
  }

  function countsKey(counts) {
    return counts.join("");
  }

  function isSuitTile(index) {
    return index >= 0 && index < 27;
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

  function parseNotation(text) {
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

    if (totalTiles(counts) > 14) {
      throw new Error("手牌は14枚までです。");
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

  function normalShanten(inputCounts) {
    const key = countsKey(inputCounts);
    if (normalShantenMemo.has(key)) return normalShantenMemo.get(key);

    const counts = cloneCounts(inputCounts);
    let best = 8;

    const updateBest = (melds, taatsu, hasPair) => {
      const usableTaatsu = Math.min(taatsu, 4 - melds);
      const value = 8 - melds * 2 - usableTaatsu - (hasPair ? 1 : 0);
      if (value < best) best = value;
    };

    const dfs = (startIndex, melds, taatsu, hasPair) => {
      if (best === -1) return;
      if (melds > 4 || taatsu > 4) return;

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
    normalShantenMemo.set(key, best);
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

  function minShanten(counts) {
    const key = countsKey(counts);
    if (minShantenMemo.has(key)) return minShantenMemo.get(key);

    const values = {
      normal: normalShanten(counts),
      chiitoitsu: chiitoitsuShanten(counts),
      kokushi: kokushiShanten(counts),
    };
    const shanten = Math.min(values.normal, values.chiitoitsu, values.kokushi);
    const typeNames = [];

    if (values.normal === shanten) typeNames.push("通常手");
    if (values.chiitoitsu === shanten) typeNames.push("七対子");
    if (values.kokushi === shanten) typeNames.push("国士無双");

    const result = { shanten, values, typeNames };
    minShantenMemo.set(key, result);
    return result;
  }

  function formatShanten(value) {
    if (value < 0) return "和了";
    if (value === 0) return "テンパイ";
    return `${value}シャンテン`;
  }

  function analyzeDiscards(counts) {
    const options = [];

    for (let discard = 0; discard < 34; discard += 1) {
      if (counts[discard] === 0) continue;

      const afterDiscard = cloneCounts(counts);
      afterDiscard[discard] -= 1;
      const afterInfo = minShanten(afterDiscard);
      const accepts = [];
      let totalAcceptance = 0;

      for (let draw = 0; draw < 34; draw += 1) {
        const remainingCopies = 4 - counts[draw];
        if (remainingCopies <= 0) continue;

        const afterDraw = cloneCounts(afterDiscard);
        afterDraw[draw] += 1;
        const drawInfo = minShanten(afterDraw);

        if (drawInfo.shanten < afterInfo.shanten) {
          accepts.push({
            tile: draw,
            remaining: remainingCopies,
            shanten: drawInfo.shanten,
          });
          totalAcceptance += remainingCopies;
        }
      }

      options.push({
        discard,
        afterShanten: afterInfo.shanten,
        afterTypes: afterInfo.typeNames,
        accepts,
        totalAcceptance,
      });
    }

    options.sort((a, b) => {
      if (a.afterShanten !== b.afterShanten) return a.afterShanten - b.afterShanten;
      if (a.totalAcceptance !== b.totalAcceptance) return b.totalAcceptance - a.totalAcceptance;
      return a.discard - b.discard;
    });

    return options;
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
          disabled: total >= 14 || count >= 4,
          badge: count ? String(count) : "",
          titleSuffix: "を追加",
          onClick: () => {
            if (totalTiles(state.counts) >= 14 || state.counts[index] >= 4) return;
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

  function renderResult() {
    const result = document.getElementById("result");
    if (!result) return;

    result.replaceChildren();
    const total = totalTiles(state.counts);

    const title = document.createElement("h2");
    title.textContent = "計算結果";
    result.append(title);

    if (total !== 14) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = `14枚ちょうど選ぶと計算します。現在は ${total} 枚です。`;
      result.append(empty);
      return;
    }

    const currentInfo = minShanten(state.counts);
    const options = analyzeDiscards(state.counts);
    const bestShanten = Math.min(...options.map((option) => option.afterShanten));
    const bestAcceptance = Math.max(
      ...options
        .filter((option) => option.afterShanten === bestShanten)
        .map((option) => option.totalAcceptance),
    );

    const summary = document.createElement("div");
    summary.className = "summary";

    const score = document.createElement("div");
    score.className = "score-card";
    score.innerHTML = `
      <div class="score-label">現在の手牌</div>
      <div class="score-value">${formatShanten(currentInfo.shanten)}</div>
      <div class="score-sub">${currentInfo.typeNames.join(" / ")} 基準</div>
    `;
    summary.append(score);

    const note = document.createElement("div");
    note.className = "note-card";
    note.innerHTML = `
      <strong>受け入れ枚数</strong>は、選んだ牌を1枚切った後に、ツモるとシャンテン数が1つ以上進む牌の残り枚数合計です。<br>
      残り枚数は「4枚 − 現在の14枚に含まれている枚数」で数えています。
    `;
    summary.append(note);
    result.append(summary);

    const tableWrap = document.createElement("div");
    tableWrap.className = "result-table-wrap";
    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr>
          <th>切る牌</th>
          <th>切った後</th>
          <th>受け入れ枚数</th>
          <th>受け入れ牌</th>
        </tr>
      </thead>
    `;
    const tbody = document.createElement("tbody");

    for (const option of options) {
      const row = document.createElement("tr");
      if (option.afterShanten === bestShanten && option.totalAcceptance === bestAcceptance) {
        row.className = "best";
      }

      const discardCell = document.createElement("td");
      discardCell.className = "discard-cell";
      discardCell.append(createMiniTile(option.discard));
      if (row.className === "best") {
        const bestPill = document.createElement("span");
        bestPill.className = "pill";
        bestPill.textContent = "おすすめ";
        discardCell.append(bestPill);
      }
      row.append(discardCell);

      const shantenCell = document.createElement("td");
      shantenCell.innerHTML = `
        <strong>${formatShanten(option.afterShanten)}</strong>
        <span class="muted">（${option.afterTypes.join(" / ")}）</span>
      `;
      row.append(shantenCell);

      const countCell = document.createElement("td");
      countCell.className = "ukeire-count";
      countCell.textContent = `${option.totalAcceptance}枚`;
      row.append(countCell);

      const acceptsCell = document.createElement("td");
      acceptsCell.className = "chips";
      if (option.accepts.length) {
        for (const accept of option.accepts) {
          acceptsCell.append(createMiniTile(accept.tile, `${accept.remaining}枚`));
        }
      } else {
        const muted = document.createElement("span");
        muted.className = "muted";
        muted.textContent = "なし";
        acceptsCell.append(muted);
      }
      row.append(acceptsCell);

      tbody.append(row);
    }

    table.append(tbody);
    tableWrap.append(table);
    result.append(tableWrap);
  }

  function renderAll({ syncNotation = false } = {}) {
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

    const applyNotation = () => {
      try {
        state.counts = parseNotation(notation.value);
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
      state.counts = parseNotation(sample);
      renderAll({ syncNotation: true });
    });
  }

  function init() {
    bindControls();
    renderAll({ syncNotation: true });
  }

  const publicApi = {
    TILE_DEFS,
    parseNotation,
    toNotation,
    normalShanten,
    chiitoitsuShanten,
    kokushiShanten,
    minShanten,
    analyzeDiscards,
    formatShanten,
  };

  if (typeof window !== "undefined") {
    window.MahjongShanten = publicApi;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = publicApi;
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
