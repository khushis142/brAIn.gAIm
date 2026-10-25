var WORDS = [
  'APPLE', 'BRAVE', 'CRANE', 'DOUBT', 'EAGLE', 'FAITH', 'GLOBE', 'HEART', 'IDEAL', 'JOKER',
  'KNEEL', 'LEMON', 'MONEY', 'NORTH', 'OCEAN', 'PIANO', 'QUIET', 'RIVER', 'STONE', 'TIGER',
  'UNITY', 'VIVID', 'WATER', 'YOUTH', 'ZEBRA', 'BREAD', 'CLOUD', 'DRIVE', 'EARTH', 'FLAME',
  'GRAPE', 'HOUSE', 'IMAGE', 'JUDGE', 'LIGHT', 'MUSIC', 'NOBLE', 'OLIVE', 'PRIDE', 'QUEST',
  'ROAST', 'SMILE', 'TRUST', 'UNDER', 'VOICE', 'WORLD', 'YIELD', 'BLOOM', 'CHESS', 'DANCE',
];

var KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
var MAX_GUESSES = 6;
var WORD_LEN = 5;
var FLIP_DURATION = 0.35;
var FLIP_STAGGER = 0.25;
var REVEAL_TOTAL = (WORD_LEN - 1) * FLIP_STAGGER + FLIP_DURATION;

var state = {
  width: 0, height: 0, target: '', guesses: [], current: '', gameOver: false, won: false,
  message: '', messageTimer: 0, keyColors: {}, keyRects: [], tileRects: [], reveal: null,
};
var hostApi = null;

function layout() {
  var w = state.width, h = state.height;
  var tileGap = 6;
  var tileSize = Math.min(Math.floor((w - tileGap * (WORD_LEN + 1)) / WORD_LEN), 48);
  var gridWidth = tileSize * WORD_LEN + tileGap * (WORD_LEN - 1);
  var gridLeft = (w - gridWidth) / 2;
  var gridTop = 56;
  state.tileRects = [];
  for (var r = 0; r < MAX_GUESSES; r++) {
    for (var c = 0; c < WORD_LEN; c++) {
      state.tileRects.push({
        row: r, col: c,
        x: gridLeft + c * (tileSize + tileGap),
        y: gridTop + r * (tileSize + tileGap),
        size: tileSize,
      });
    }
  }

  var kbTop = gridTop + MAX_GUESSES * (tileSize + tileGap) + 16;
  var keyGap = 5;
  var keyWidth = Math.min(Math.floor((w - keyGap * 11) / 10), 34);
  var keyHeight = Math.floor(keyWidth * 1.3);
  state.keyRects = [];
  for (var ri = 0; ri < KEY_ROWS.length; ri++) {
    var row = KEY_ROWS[ri];
    var extra = ri === 2 ? 2 : 0;
    var rowWidth = row.length * (keyWidth + keyGap) - keyGap + extra * (keyWidth * 1.5 + keyGap);
    var left = (w - rowWidth) / 2;
    var x = left;
    if (ri === 2) {
      state.keyRects.push({ label: 'ENTER', key: 'ENTER', x: x, y: kbTop + ri * (keyHeight + keyGap), w: keyWidth * 1.5, h: keyHeight });
      x += keyWidth * 1.5 + keyGap;
    }
    for (var ci = 0; ci < row.length; ci++) {
      state.keyRects.push({ label: row[ci], key: row[ci], x: x, y: kbTop + ri * (keyHeight + keyGap), w: keyWidth, h: keyHeight });
      x += keyWidth + keyGap;
    }
    if (ri === 2) {
      state.keyRects.push({ label: 'DEL', key: 'DEL', x: x, y: kbTop + ri * (keyHeight + keyGap), w: keyWidth * 1.5, h: keyHeight });
    }
  }
}

function showMessage(text) {
  state.message = text;
  state.messageTimer = 1.6;
}

function scoreGuess(guess, target) {
  var result = new Array(WORD_LEN).fill('absent');
  var targetLetters = target.split('');
  var used = new Array(WORD_LEN).fill(false);

  for (var i = 0; i < WORD_LEN; i++) {
    if (guess[i] === targetLetters[i]) {
      result[i] = 'correct';
      used[i] = true;
    }
  }
  for (var j = 0; j < WORD_LEN; j++) {
    if (result[j] === 'correct') continue;
    for (var k = 0; k < WORD_LEN; k++) {
      if (!used[k] && guess[j] === targetLetters[k]) {
        result[j] = 'present';
        used[k] = true;
        break;
      }
    }
  }
  return result;
}

function colorFor(status) {
  if (status === 'correct') return '#2ecc71';
  if (status === 'present') return '#e5c33b';
  return '#4a4d63';
}

function submitGuess() {
  if (state.current.length < WORD_LEN) {
    showMessage('Not enough letters');
    return;
  }
  var result = scoreGuess(state.current, state.target);
  state.reveal = {
    word: state.current,
    result: result,
    elapsed: 0,
    keyApplied: [false, false, false, false, false],
  };
  state.current = '';
}

function applyKeyColor(letter, status) {
  var rank = { absent: 0, present: 1, correct: 2 };
  var prev = state.keyColors[letter];
  if (!prev || rank[status] > rank[prev]) state.keyColors[letter] = status;
}

function finishReveal() {
  var rev = state.reveal;
  for (var i = 0; i < WORD_LEN; i++) {
    if (!rev.keyApplied[i]) applyKeyColor(rev.word[i], rev.result[i]);
  }
  state.guesses.push({ word: rev.word, result: rev.result });
  state.reveal = null;

  if (rev.word === state.target) {
    state.gameOver = true;
    state.won = true;
    var score = Math.max(10, 110 - state.guesses.length * 15);
    if (hostApi) hostApi.submitResult({ score: score, guesses: state.guesses.length, won: true, completed: true });
  } else if (state.guesses.length >= MAX_GUESSES) {
    state.gameOver = true;
    state.won = false;
    if (hostApi) hostApi.submitResult({ score: 0, guesses: state.guesses.length, won: false, completed: true });
  }
}

function pressKey(key) {
  if (state.gameOver || state.reveal) return;
  if (key === 'ENTER') {
    submitGuess();
  } else if (key === 'DEL') {
    state.current = state.current.slice(0, -1);
  } else if (state.current.length < WORD_LEN) {
    state.current += key;
  }
}

// The runtime's documented `input.keys` only ever carries arrow keys and
// Space (confirmed by reading game-runtime.js: its key tracker filters every
// keydown through a fixed allow-list that excludes letters). Listening here
// directly on the sandboxed iframe's own window is a deliberate workaround to
// get real keyboard typing, since the official input API cannot provide it.
window.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    pressKey('ENTER');
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    pressKey('DEL');
  } else if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    pressKey(e.key.toUpperCase());
  }
});

function hitTest(rects, x, y) {
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
  }
  return null;
}

function init(api) {
  hostApi = api;
  state.width = api.width;
  state.height = api.height;
  state.target = WORDS[Math.floor(Math.random() * WORDS.length)];
  state.guesses = [];
  state.current = '';
  state.gameOver = false;
  state.won = false;
  state.message = '';
  state.messageTimer = 0;
  state.keyColors = {};
  layout();
}

function resize(width, height) {
  state.width = width;
  state.height = height;
  layout();
}

function update(dt, input) {
  if (state.messageTimer > 0) {
    state.messageTimer -= dt;
    if (state.messageTimer <= 0) state.message = '';
  }

  if (state.reveal) {
    state.reveal.elapsed += dt;
    for (var i = 0; i < WORD_LEN; i++) {
      var midpoint = i * FLIP_STAGGER + FLIP_DURATION / 2;
      if (!state.reveal.keyApplied[i] && state.reveal.elapsed >= midpoint) {
        state.reveal.keyApplied[i] = true;
        applyKeyColor(state.reveal.word[i], state.reveal.result[i]);
      }
    }
    if (state.reveal.elapsed >= REVEAL_TOTAL) {
      finishReveal();
    }
    return;
  }

  if (input.pointer && input.pointer.justPressed) {
    var hit = hitTest(state.keyRects, input.pointer.x, input.pointer.y);
    if (hit) pressKey(hit.key);
  }
}

function drawTile(ctx, t, letter, bg, border, scaleY) {
  ctx.save();
  if (scaleY !== 1) {
    var cx = t.x + t.size / 2;
    var cy = t.y + t.size / 2;
    ctx.translate(cx, cy);
    ctx.scale(1, Math.max(0.02, scaleY));
    ctx.translate(-cx, -cy);
  }
  ctx.fillStyle = bg;
  ctx.fillRect(t.x, t.y, t.size, t.size);
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.strokeRect(t.x, t.y, t.size, t.size);
  if (letter) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.floor(t.size * 0.5) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, t.x + t.size / 2, t.y + t.size / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

function render(ctx) {
  ctx.fillStyle = '#11121b';
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.fillStyle = '#f3f4fb';
  ctx.textAlign = 'center';
  ctx.font = '18px sans-serif';
  ctx.fillText('Wordle', state.width / 2, 28);

  var revealRow = state.reveal ? state.guesses.length : -1;

  for (var i = 0; i < state.tileRects.length; i++) {
    var t = state.tileRects[i];
    var guessObj = state.guesses[t.row];
    var letter = '';
    var bg = '#1c1e2b';
    var border = '#3a3d52';
    var scaleY = 1;

    if (t.row === revealRow) {
      letter = state.reveal.word[t.col];
      var tileStart = t.col * FLIP_STAGGER;
      var localT = (state.reveal.elapsed - tileStart) / FLIP_DURATION;
      if (localT < 0) {
        border = '#8a8fb0';
      } else if (localT < 1) {
        if (localT < 0.5) {
          scaleY = Math.cos(localT * Math.PI);
          border = '#8a8fb0';
        } else {
          scaleY = -Math.cos(localT * Math.PI);
          bg = colorFor(state.reveal.result[t.col]);
          border = bg;
        }
      } else {
        bg = colorFor(state.reveal.result[t.col]);
        border = bg;
      }
    } else if (guessObj) {
      letter = guessObj.word[t.col];
      bg = colorFor(guessObj.result[t.col]);
      border = bg;
    } else if (t.row === state.guesses.length && t.col < state.current.length) {
      letter = state.current[t.col];
      border = '#8a8fb0';
    }

    drawTile(ctx, t, letter, bg, border, scaleY);
  }

  for (var k = 0; k < state.keyRects.length; k++) {
    var key = state.keyRects[k];
    var keyColor = state.keyColors[key.key];
    ctx.fillStyle = keyColor ? colorFor(keyColor) : '#2b2e40';
    ctx.fillRect(key.x, key.y, key.w, key.h);
    ctx.fillStyle = '#f3f4fb';
    ctx.font = (key.label.length > 1 ? 'bold 10px' : 'bold 13px') + ' sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(key.label, key.x + key.w / 2, key.y + key.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  if (state.message) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    var msgWidth = ctx.measureText(state.message).width + 24;
    ctx.fillRect(state.width / 2 - msgWidth / 2, 36, msgWidth, 22);
    ctx.fillStyle = '#11121b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.message, state.width / 2, 51);
  }

  if (state.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, state.height / 2 - 35, state.width, 70);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(
      state.won ? 'You got it!' : 'Word was: ' + state.target,
      state.width / 2,
      state.height / 2 + 6,
    );
  }
}

registerGame({ renderer: '2d', init: init, update: update, render: render, resize: resize });
