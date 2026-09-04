(function () {
  "use strict";

  // ---- CONFIG — change when cloning this file for a new game ----
  var CONFIG = {
    name: "2048",
    slug: "2048.html",
    size: 4,
    winValue: 2048,
    bestKey: "best-score-2048"
  };

  var SIZE = CONFIG.size;
  var WIN_VALUE = CONFIG.winValue;

  var board = [];
  var score = 0;
  var best = 0;
  var won = false;
  var keepPlaying = false;
  var over = false;
  var newCell = null;      // [row, col] of the tile spawned last move
  var mergedCells = [];    // [row, col] list of tiles merged last move

  var boardEl = document.getElementById("board");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var messageEl = document.getElementById("message");
  var messageText = document.getElementById("message-text");
  var msgPrimary = document.getElementById("message-primary");
  var msgSecondary = document.getElementById("message-secondary");
  var newGameBtn = document.getElementById("new-game");

  // ---- 关卡状态 ----
  var levels = [8, 16, 32, 64, 128, 256, 512, 1024, 2048];
  var levelSizes = [3, 3, 3, 4, 4, 4, 4, 4, 4]; // 每关棋盘尺寸（前 3 关 3×3，之后 4×4）
  var currentLevel = 0;   // 0~8 = 关卡下标；levels.length(=9) = 无限模式
  var unlocked = 0;       // 已解锁的最大关卡下标（levels.length 表示无限已解锁）
  var moves = 0;          // 本关步数
  var winCell = null;     // 过关目标 tile 的 [row, col]
  var stars = [];         // 每关最高星数（1~3），未过为 0
  var STAR_STEPS = {
    8: [8, 16], 16: [18, 36], 32: [30, 60], 64: [48, 96], 128: [70, 140],
    256: [95, 190], 512: [120, 240], 1024: [150, 300], 2048: [180, 360]
  };
  var sessionBest = 0;    // 本次会话开始前的最高分（破纪录判定用）
  var bestBroken = false;
  var bestToastTimer = null;

  var levelLabelEl = document.getElementById("level-label");
  var stepsLabelEl = document.getElementById("steps-label");
  var starsPreviewEl = document.getElementById("stars-preview");
  var levelSelectBtn = document.getElementById("level-select-btn");
  var levelSelectEl = document.getElementById("level-select");
  var levelGridEl = document.getElementById("level-grid");
  var levelSelectClose = document.getElementById("level-select-close");
  var bestToastEl = document.getElementById("best-toast");

  function target() {
    return (currentLevel < levels.length) ? levels[currentLevel] : 2048;
  }

  // ---- Persistence (with graceful fallback) ----
  function loadBest() {
    try {
      var v = localStorage.getItem(CONFIG.bestKey);
      best = v ? (parseInt(v, 10) || 0) : 0;
    } catch (e) {
      best = 0;
    }
  }
  function saveBest() {
    if (score > best) {
      best = score;
      // 首次超过本次会话开始前的最高分时，提示一次
      if (!bestBroken && sessionBest > 0 && score > sessionBest) {
        bestBroken = true;
        showBestToast();
      }
    }
    try { localStorage.setItem(CONFIG.bestKey, String(best)); } catch (e) { /* ignore */ }
    bestEl.textContent = best;
  }

  function loadUnlocked() {
    try {
      var v = parseInt(localStorage.getItem("level-unlocked-2048"), 10) || 0;
      unlocked = Math.min(Math.max(v, 0), levels.length);
    } catch (e) {
      unlocked = 0;
    }
  }
  function saveUnlocked() {
    try { localStorage.setItem("level-unlocked-2048", String(unlocked)); } catch (e) { /* ignore */ }
  }

  function loadStars() {
    try {
      var v = JSON.parse(localStorage.getItem("stars-2048"));
      stars = (v && typeof v === "object") ? v : [];
    } catch (e) {
      stars = [];
    }
  }
  function saveStars() {
    try { localStorage.setItem("stars-2048", JSON.stringify(stars)); } catch (e) { /* ignore */ }
  }

  // ---- Board helpers ----
  function emptyCells() {
    var cells = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (board[r][c] === 0) cells.push([r, c]);
      }
    }
    return cells;
  }

  function addRandomTile() {
    var cells = emptyCells();
    if (cells.length === 0) return;
    var cell = cells[Math.floor(Math.random() * cells.length)];
    board[cell[0]][cell[1]] = Math.random() < 0.9 ? 2 : 4;
    newCell = cell;
  }

  // Slide a single line toward index 0 ("left"). Returns the result,
  // score gained, and the resulting indexes of tiles that merged.
  function slideRow(row) {
    var arr = [];
    for (var i = 0; i < row.length; i++) if (row[i] !== 0) arr.push(row[i]);
    var result = [];
    var gained = 0;
    var merged = [];
    for (var j = 0; j < arr.length; j++) {
      if (j + 1 < arr.length && arr[j] === arr[j + 1]) {
        var m = arr[j] * 2;
        result.push(m);
        merged.push(result.length - 1);
        gained += m;
        j++; // skip the paired tile
      } else {
        result.push(arr[j]);
      }
    }
    while (result.length < SIZE) result.push(0);
    return { row: result, gained: gained, merged: merged };
  }

  function move(direction) {
    var before = JSON.stringify(board);
    var gained = 0;
    mergedCells = [];

    if (direction === "left") {
      for (var r = 0; r < SIZE; r++) {
        var res = slideRow(board[r]);
        board[r] = res.row;
        gained += res.gained;
        for (var i = 0; i < res.merged.length; i++) mergedCells.push([r, res.merged[i]]);
      }
    } else if (direction === "right") {
      for (var r = 0; r < SIZE; r++) {
        var line = board[r].slice().reverse();
        var res = slideRow(line);
        board[r] = res.row.reverse();
        gained += res.gained;
        for (var i = 0; i < res.merged.length; i++) mergedCells.push([r, SIZE - 1 - res.merged[i]]);
      }
    } else if (direction === "up") {
      for (var c = 0; c < SIZE; c++) {
        var col = [];
        for (var r = 0; r < SIZE; r++) col.push(board[r][c]);
        var res = slideRow(col);
        for (var r = 0; r < SIZE; r++) board[r][c] = res.row[r];
        gained += res.gained;
        for (var i = 0; i < res.merged.length; i++) mergedCells.push([res.merged[i], c]);
      }
    } else if (direction === "down") {
      for (var c = 0; c < SIZE; c++) {
        var col = [];
        for (var r = SIZE - 1; r >= 0; r--) col.push(board[r][c]);
        var res = slideRow(col);
        for (var r = 0; r < SIZE; r++) board[r][c] = res.row[SIZE - 1 - r];
        gained += res.gained;
        for (var i = 0; i < res.merged.length; i++) mergedCells.push([SIZE - 1 - res.merged[i], c]);
      }
    }

    var moved = before !== JSON.stringify(board);
    if (moved) {
      if (firstMove) { firstMove = false; hideFirstHint(); }
      if (mergedCells.length) playMergeSound(); else playMoveSound();
      moves++;
      updateLevelBar();
      score += gained;
      addRandomTile();
      render();
      saveBest();
      checkStatus();
    }
    return moved;
  }

  // ---- Render ----
  function render() {
    // remove existing tiles (keep background cells + message overlay)
    var tiles = boardEl.querySelectorAll(".tile");
    for (var i = 0; i < tiles.length; i++) tiles[i].parentNode.removeChild(tiles[i]);

    var mergedSet = {};
    for (var m = 0; m < mergedCells.length; m++) {
      mergedSet[mergedCells[m][0] + "," + mergedCells[m][1]] = true;
    }

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var val = board[r][c];
        if (val === 0) continue;
        var tile = document.createElement("div");
        tile.className = "tile tile-" + (val <= WIN_VALUE ? val : "super");
        tile.textContent = val;
        tile.style.gridRow = (r + 1) + " / span 1";
        tile.style.gridColumn = (c + 1) + " / span 1";
        tile.setAttribute("aria-hidden", "true");
        if (val >= 1000 && val < 10000) tile.classList.add("tile-4d");
        else if (val >= 10000) tile.classList.add("tile-5d");
        if (newCell && newCell[0] === r && newCell[1] === c) tile.classList.add("tile-new");
        if (mergedSet[r + "," + c]) tile.classList.add("tile-merged");
        if (winCell && winCell[0] === r && winCell[1] === c) tile.classList.add("tile-win");
        boardEl.appendChild(tile);
      }
    }

    scoreEl.textContent = score;
    bestEl.textContent = best;
    newCell = null;
  }

  // ---- Win / lose ----
  function canMove() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (board[r][c] === 0) return true;
        if (c + 1 < SIZE && board[r][c] === board[r][c + 1]) return true;
        if (r + 1 < SIZE && board[r][c] === board[r + 1][c]) return true;
      }
    }
    return false;
  }

  function showMessage(text, primaryLabel, primaryFn, secondaryLabel, secondaryFn) {
    messageText.textContent = text;
    msgPrimary.textContent = primaryLabel;
    msgPrimary.onclick = function () { primaryFn(); };
    if (secondaryLabel) {
      msgSecondary.textContent = secondaryLabel;
      msgSecondary.hidden = false;
      msgSecondary.onclick = function () { secondaryFn(); };
    } else {
      msgSecondary.hidden = true;
    }
    messageEl.hidden = false;
    msgPrimary.focus();
  }

  function hideMessage() {
    var wasShown = !messageEl.hidden;
    messageEl.hidden = true;
    if (wasShown) newGameBtn.focus();
  }

  function checkStatus() {
    if (!won && !keepPlaying) {
      var t = target();
      for (var r = 0; r < SIZE; r++) {
        for (var c = 0; c < SIZE; c++) {
          if (board[r][c] >= t) {
            won = true;
            if (currentLevel < levels.length) {
              handleLevelClear(r, c);
            } else {
              showMessage(
                "You made 2048! 🎉",
                "Keep playing",
                function () { keepPlaying = true; hideMessage(); }
              );
            }
            return;
          }
        }
      }
    }
    if (!canMove()) {
      over = true;
      showMessage("Game over!", "Retry", function () { newGame(); }, "Levels", function () { openLevelSelect(); });
    }
  }

  // ---- New game ----
  function newGame() {
    board = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(0);
      board.push(row);
    }
    score = 0;
    won = false;
    keepPlaying = false;
    over = false;
    newCell = null;
    mergedCells = [];
    winCell = null;
    moves = 0;
    hideMessage();
    addRandomTile();
    addRandomTile();
    render();
    scoreEl.textContent = 0;
    firstMove = true;
    firstHint.hidden = false;
    updateLevelBar();
  }

  // ---- Input ----
  function keyToDirection(e) {
    var k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") return "left";
    if (k === "ArrowRight" || k === "d" || k === "D") return "right";
    if (k === "ArrowUp" || k === "w" || k === "W") return "up";
    if (k === "ArrowDown" || k === "s" || k === "S") return "down";
    return null;
  }

  document.addEventListener("keydown", function (e) {
    ensureAudio();
    var dir = keyToDirection(e);
    if (dir) {
      e.preventDefault();
      move(dir);
    }
  });

  var touchStartX = 0, touchStartY = 0;
  boardEl.addEventListener("touchstart", function (e) {
    ensureAudio();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  boardEl.addEventListener("touchend", function (e) {
    var dx = e.changedTouches[0].clientX - touchStartX;
    var dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return; // ignore taps
    if (Math.abs(dx) > Math.abs(dy)) {
      move(dx > 0 ? "right" : "left");
    } else {
      move(dy > 0 ? "down" : "up");
    }
  }, { passive: true });

  newGameBtn.addEventListener("click", newGame);
  levelSelectBtn.addEventListener("click", openLevelSelect);
  levelSelectClose.addEventListener("click", closeLevelSelect);

  // ---- 关卡逻辑 ----
  function updateLevelBar() {
    if (currentLevel < levels.length) {
      levelLabelEl.textContent = "Level " + (currentLevel + 1) + " — Target " + target();
      starsPreviewEl.textContent = starString(starRating());
      starsPreviewEl.hidden = false;
    } else {
      levelLabelEl.textContent = "∞ Endless Mode";
      starsPreviewEl.hidden = true;
    }
    stepsLabelEl.textContent = "Steps " + moves;
  }

  function goToLevel(i) {
    currentLevel = i;
    SIZE = (i < levels.length) ? levelSizes[i] : 4;
    applyBoardSize();
    closeLevelSelect();
    newGame();
  }

  function applyBoardSize() {
    boardEl.style.gridTemplateColumns = "repeat(" + SIZE + ", 1fr)";
    boardEl.style.gridTemplateRows = "repeat(" + SIZE + ", 1fr)";
    boardEl.setAttribute("data-size", SIZE);
    var cells = boardEl.querySelectorAll(".cell");
    for (var i = 0; i < cells.length; i++) cells[i].parentNode.removeChild(cells[i]);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < SIZE * SIZE; i++) {
      var cell = document.createElement("div");
      cell.className = "cell";
      frag.appendChild(cell);
    }
    boardEl.insertBefore(frag, messageEl);
  }

  function starRating() {
    var thr = STAR_STEPS[target()] || [0, 0];
    if (moves <= thr[0]) return 3;
    if (moves <= thr[1]) return 2;
    return 1;
  }
  function starString(n) {
    var s = "";
    for (var i = 1; i <= 3; i++) s += (i <= n ? "★" : "☆");
    return s;
  }

  function handleLevelClear(r, c) {
    var level = currentLevel;
    unlocked = Math.max(unlocked, level + 1);
    saveUnlocked();
    var got = starRating();
    stars[level] = Math.max(stars[level] || 0, got);
    saveStars();

    winCell = [r, c];
    render();
    fireConfetti();
    playWinSound();

    var isLast = (level === levels.length - 1);
    var title = isLast ? "All levels cleared! 🎉" : "Level " + (level + 1) + " Complete! 🎉";
    var nextLabel = isLast ? "Endless mode" : "Next level";
    var nextFn = function () { goToLevel(level + 1); };
    var replayFn = function () { newGame(); };

    setTimeout(function () {
      showMessage(title + "\n" + starString(got), nextLabel, nextFn, "Replay", replayFn);
    }, 650);
  }

  function fireConfetti() {
    var colors = ["#edc22e", "#f65e3b", "#f67c5f", "#8f7a66", "#f2b179", "#edcf72", "#776e65"];
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 60; i++) {
      var p = document.createElement("div");
      p.className = "confetti";
      p.style.left = Math.floor(Math.random() * 100) + "vw";
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDuration = (1.6 + Math.random() * 1.4) + "s";
      p.style.animationDelay = (Math.random() * 0.4) + "s";
      p.style.transform = "rotate(" + Math.floor(Math.random() * 360) + "deg)";
      frag.appendChild(p);
    }
    document.body.appendChild(frag);
    setTimeout(function () {
      var cfs = document.querySelectorAll(".confetti");
      for (var i = 0; i < cfs.length; i++) cfs[i].parentNode.removeChild(cfs[i]);
    }, 3800);
  }

  function showBestToast() {
    bestToastEl.hidden = false;
    clearTimeout(bestToastTimer);
    bestToastTimer = setTimeout(function () { bestToastEl.hidden = true; }, 1600);
  }

  function renderLevelSelect() {
    levelGridEl.innerHTML = "";
    for (var i = 0; i <= levels.length; i++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "level-btn";
      var locked = i > unlocked;
      var starsHtml = "";
      if (i < levels.length) {
        var s = stars[i] || 0;
        if (s) starsHtml = "<span class='level-stars'>" + starString(s) + "</span>";
        btn.innerHTML = (locked ? "🔒 Level " + (i + 1) : "Level " + (i + 1) + " · " + levels[i]) + starsHtml;
      } else {
        btn.innerHTML = locked ? "🔒 Endless" : "∞ Endless";
      }
      btn.disabled = locked;
      if (!locked) {
        (function (li) {
          btn.addEventListener("click", function () { goToLevel(li); });
        })(i);
      }
      levelGridEl.appendChild(btn);
    }
  }

  function openLevelSelect() {
    renderLevelSelect();
    levelSelectEl.hidden = false;
  }
  function closeLevelSelect() {
    levelSelectEl.hidden = true;
  }

  // ---- 音效（Web Audio，无外部资源）----
  var audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }
  function playTone(freq, dur, type, gain, delay) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var osc = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function playNoiseBurst(dur, gain, delay, freq) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var bufferSize = Math.floor(audioCtx.sampleRate * dur);
    var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
    var src = audioCtx.createBufferSource();
    src.buffer = buffer;
    var filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq || 1000;
    filter.Q.value = 0.8;
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(gain || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(audioCtx.destination);
    src.start(t0);
  }
  function playMoveSound() {
    ensureAudio();
    if (!audioCtx) return;
    playNoiseBurst(0.08, 0.14, 0, 420);
  }
  function playMergeSound() {
    ensureAudio();
    if (!audioCtx) return;
    playTone(440, 0.1, "sine", 0.22);
    playTone(660, 0.14, "sine", 0.2, 0.05);
  }
  function playWinSound() {
    ensureAudio();
    if (!audioCtx) return;
    // 胜利号角（上升音阶）
    playTone(523.25, 0.12, "triangle", 0.22);
    playTone(659.25, 0.12, "triangle", 0.22, 0.09);
    playTone(783.99, 0.14, "triangle", 0.22, 0.18);
    playTone(1046.5, 0.28, "triangle", 0.2, 0.27);
    // 礼花爆炸声
    playNoiseBurst(0.14, 0.28, 0.08, 2200);
    playNoiseBurst(0.14, 0.28, 0.28, 1800);
    playNoiseBurst(0.16, 0.26, 0.48, 2600);
    playNoiseBurst(0.2, 0.22, 0.72, 1500);
    // 欢呼（带通噪声，模拟人群欢呼起伏）
    cheer(0.0, 1.6);
  }
  function cheer(delay, dur) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var bufferSize = Math.floor(audioCtx.sampleRate * dur);
    var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
    var src = audioCtx.createBufferSource();
    src.buffer = buffer;
    var filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.35;
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.35);
    g.gain.setValueAtTime(0.16, t0 + 0.65);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(audioCtx.destination);
    src.start(t0);
  }

  // ---- 首次滑动提示 + 自动演示 ----
  var touchDevice = window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  var firstMove = true;
  var firstHint = document.getElementById("first-hint");
  var demoText = document.getElementById("demo-text");
  var demoHand = document.getElementById("demo-hand");
  function hideFirstHint() { firstHint.hidden = true; }

  // 首次访问时自动演示一次「两个 2 合并成 4」，之后不再出现
  var DEMO_KEY = "demo-seen-2048";
  function hasSeenDemo() {
    try { return localStorage.getItem(DEMO_KEY) === "1"; } catch (e) { return true; }
  }
  function markDemoSeen() {
    try { localStorage.setItem(DEMO_KEY, "1"); } catch (e) { /* ignore */ }
  }

  function playMergeDemo() {
    // 演示局面：第一行两个相邻的 2，向左合并成一个 4（配手势 + 文字 + 音效）
    board = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(0);
      board.push(row);
    }
    board[0][0] = 2;
    board[0][1] = 2;
    score = 0;
    newCell = null;
    mergedCells = [];
    render();
    scoreEl.textContent = 0;
    demoText.hidden = false;
    demoHand.hidden = false;
    setTimeout(function () {
      board[0][0] = 4;
      board[0][1] = 0;
      mergedCells = [[0, 0]];
      render();
      playMergeSound();
    }, 600);
    setTimeout(function () {
      demoText.hidden = true;
      demoHand.hidden = true;
      newGame();
    }, 2200);
  }

  // ---- Init ----
  loadBest();
  sessionBest = best;
  loadUnlocked();
  loadStars();
  bestEl.textContent = best;
  firstHint.textContent = touchDevice ? "Swipe to merge equal tiles" : "Use arrow keys to merge equal tiles";
  currentLevel = unlocked;
  SIZE = (currentLevel < levels.length) ? levelSizes[currentLevel] : 4;
  if (!hasSeenDemo()) {
    markDemoSeen();
    applyBoardSize();
    playMergeDemo();
  } else {
    goToLevel(currentLevel);
  }
})();
