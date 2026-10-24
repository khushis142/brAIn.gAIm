let api;
let W = 0;
let H = 0;
let questions = [];
let current = 0;
let correct = 0;
let state = 'ready';
let selectedSide = 0;
let previousSide = 0;
let jumpProgress = 0;
let jumpStartDepth = 0;
let feedbackTimer = 0;
let lastCorrect = false;
let finished = false;

function init(gameApi) {
  api = gameApi;
  W = api.width;
  H = api.height;
  questions = (Array.isArray(api.data.questions) ? api.data.questions : [])
    .filter(
      (q) =>
        q &&
        typeof q.question === 'string' &&
        q.question.trim() &&
        typeof q.correctAnswer === 'string' &&
        q.correctAnswer.trim() &&
        typeof q.wrongAnswer === 'string' &&
        q.wrongAnswer.trim(),
    )
    .map((q) => {
      const correctOnLeft = Math.random() < 0.5;
      return {
        question: q.question,
        answers: correctOnLeft
          ? [q.correctAnswer, q.wrongAnswer]
          : [q.wrongAnswer, q.correctAnswer],
        correctSide: correctOnLeft ? 0 : 1,
      };
    });
  api.setUiDesign({
    theme: { accent: 'teal', panel: 'dark', density: 'comfortable' },
    pauseMenu: {
      title: 'Bridge paused',
      message: 'Choose the correct answer to help your robot cross.',
      resumeLabel: 'Keep going',
    },
    leaderboard: {
      title: 'Bridge cleared',
      subtitle: 'Every correct answer brings your robot closer to safety.',
      scoreLabel: 'Bridge score',
    },
  });
  if (!questions.length) finish(false);
}

function pressed(input, key) {
  const value = input.keys[key];
  return value && typeof value === 'object'
    ? Boolean(value.justPressed)
    : Boolean(value);
}

function choose(side) {
  if (state !== 'ready' || finished) return;
  selectedSide = side;
  state = 'jump';
  jumpProgress = 0;
}

function finish(cleared) {
  if (finished) return;
  finished = true;
  state = 'finished';
  const total = questions.length;
  api.submitResult({
    score: total ? Math.round((100 * correct) / total) : 0,
    correct,
    total,
    completed: cleared,
  });
}

function update(dt, input) {
  if (finished) return;

  if (state === 'ready') {
    if (pressed(input, 'ArrowLeft')) choose(0);
    else if (pressed(input, 'ArrowRight')) choose(1);
    else if (input.pointer && input.pointer.justPressed) {
      choose(input.pointer.x < W / 2 ? 0 : 1);
    }
  } else if (state === 'jump') {
    jumpProgress = Math.min(1, jumpProgress + dt / 0.55);
    if (jumpProgress >= 1) {
      lastCorrect = selectedSide === questions[current].correctSide;
      state = 'feedback';
      feedbackTimer = 0.8;
    }
  } else if (state === 'advance') {
    jumpProgress = Math.min(1, jumpProgress + dt / 0.45);
    if (jumpProgress >= 1) state = 'ready';
  } else if (state === 'feedback') {
    feedbackTimer -= dt;
    if (feedbackTimer <= 0) {
      if (!lastCorrect) {
        finish(false);
      } else {
        correct += 1;
        current += 1;
        if (current >= questions.length) {
          finish(true);
        } else {
          previousSide = selectedSide;
          jumpStartDepth = choiceDepth(current - 1);
          state = 'advance';
          jumpProgress = 0;
        }
      }
    }
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function polygon(ctx, points, fill, stroke, lineWidth) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth || 1;
    ctx.stroke();
  }
}

function bridgeWidth(depth) {
  return W * (0.38 + 0.55 * depth);
}

function bridgeY(depth) {
  return H * (0.39 + 0.48 * depth);
}

function choiceRow(index) {
  return 5 - Math.round((index * 4) / Math.max(1, questions.length - 1));
}

function choiceDepth(index) {
  const near = 0.12 + choiceRow(index) * 0.125;
  return near - 0.0475;
}

function laneX(side, depth) {
  return W / 2 + (side ? 1 : -1) * bridgeWidth(depth) / 4;
}

function lanePoints(side, near, far, inset) {
  const nearWidth = bridgeWidth(near) / 2;
  const farWidth = bridgeWidth(far) / 2;
  const gapNear = Math.max(7, nearWidth * 0.055);
  const gapFar = Math.max(4, farWidth * 0.07);
  const innerNear = W / 2 + (side ? gapNear : -gapNear);
  const innerFar = W / 2 + (side ? gapFar : -gapFar);
  const outerNear = side ? W / 2 + nearWidth : W / 2 - nearWidth;
  const outerFar = side ? W / 2 + farWidth : W / 2 - farWidth;
  const padNear = inset || 0;
  const padFar = (inset || 0) * 0.35;
  return [
    [innerFar + (side ? padFar : -padFar), bridgeY(far)],
    [outerFar - (side ? padFar : -padFar), bridgeY(far)],
    [outerNear - (side ? padNear : -padNear), bridgeY(near)],
    [innerNear + (side ? padNear : -padNear), bridgeY(near)],
  ];
}

function drawStars(ctx) {
  ctx.fillStyle = '#dbeafe';
  for (let i = 0; i < 38; i += 1) {
    const x = ((i * 137.5) % 997) / 997 * W;
    const y = ((i * 83.7) % 311) / 311 * H * 0.43;
    const radius = i % 7 === 0 ? 1.5 : 0.8;
    ctx.globalAlpha = i % 3 === 0 ? 0.65 : 0.3;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawQuestion(ctx) {
  const pad = Math.max(16, W * 0.055);
  const boxY = H * 0.055;
  const question = questions[current] ? questions[current].question : 'Bridge cleared!';
  const fontSize = Math.max(14, Math.min(25, W * 0.061, H * 0.045));
  ctx.font = `bold ${fontSize}px sans-serif`;
  const lines = wrapText(ctx, question, W - pad * 3.4).slice(0, 3);
  const lineHeight = fontSize * 1.25;
  const boxH = Math.min(H * 0.32, Math.max(H * 0.13, 48 + lines.length * lineHeight + 20));
  ctx.fillStyle = 'rgba(11, 20, 38, 0.94)';
  roundedRect(ctx, pad, boxY, W - pad * 2, boxH, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7dd3fc';
  ctx.font = `bold ${Math.max(12, W * 0.035)}px sans-serif`;
  ctx.fillText(`BRIDGE ${current + 1} / ${questions.length}`, pad * 1.7, boxY + 14);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`${correct} SAFE`, W - pad * 1.7, boxY + 14);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  ctx.font = `bold ${fontSize}px sans-serif`;
  let y = boxY + 48;
  for (const line of lines) {
    ctx.fillText(line, pad * 1.7, y);
    y += lineHeight;
  }
}

function drawBridge(ctx) {
  const horizon = H * 0.39;
  const glow = ctx.createLinearGradient(0, horizon, 0, H * 0.9);
  glow.addColorStop(0, '#102238');
  glow.addColorStop(1, '#07111d');
  polygon(ctx, [
    [W / 2 - bridgeWidth(0.04) / 2, bridgeY(0.04)],
    [W / 2 + bridgeWidth(0.04) / 2, bridgeY(0.04)],
    [W / 2 + bridgeWidth(1) / 2, bridgeY(1)],
    [W / 2 - bridgeWidth(1) / 2, bridgeY(1)],
  ], glow);

  const activeRow = questions.length ? choiceRow(current) : -1;
  for (let row = 6; row >= 0; row -= 1) {
    const near = 0.12 + row * 0.125;
    const far = near - 0.095;
    for (let side = 0; side < 2; side += 1) {
      const points = lanePoints(side, near, far, 5);
      const isChoice = row === activeRow;
      const chosen = isChoice && (state === 'feedback' || state === 'jump') && side === selectedSide;
      let fill = side === 0 ? 'rgba(27, 166, 153, 0.29)' : 'rgba(89, 126, 178, 0.32)';
      let stroke = side === 0 ? 'rgba(76, 235, 198, 0.75)' : 'rgba(147, 197, 253, 0.72)';
      if (chosen && state === 'feedback') {
        fill = lastCorrect ? 'rgba(34, 197, 94, 0.72)' : 'rgba(239, 68, 68, 0.72)';
        stroke = lastCorrect ? '#86efac' : '#fca5a5';
      } else if (chosen) {
        fill = 'rgba(250, 204, 21, 0.42)';
        stroke = '#fde68a';
      }
      polygon(ctx, points, fill, stroke, isChoice ? 2 : 1);
      if (isChoice && questions[current]) {
        drawAnswer(ctx, questions[current].answers[side], points, side);
      }
    }
    const depth = near;
    const railY = bridgeY(depth);
    const railW = bridgeWidth(depth) / 2;
    ctx.strokeStyle = 'rgba(226, 243, 255, 0.8)';
    ctx.lineWidth = Math.max(2, depth * 6);
    for (const direction of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + direction * railW, railY);
      ctx.lineTo(W / 2 + direction * bridgeWidth(0.2) / 2, horizon);
      ctx.stroke();
    }
  }

  ctx.fillStyle = 'rgba(191, 219, 254, 0.55)';
  ctx.font = `bold ${Math.max(10, W * 0.03)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(state === 'ready' ? 'TAP LEFT OR RIGHT  |  ARROW KEYS' : 'ROBOT IN FLIGHT', W / 2, H * 0.93);
}

function drawAnswer(ctx, text, points, side) {
  const centerX = (points[0][0] + points[1][0] + points[2][0] + points[3][0]) / 4;
  const centerY = (points[0][1] + points[1][1] + points[2][1] + points[3][1]) / 4;
  const width = Math.abs(points[1][0] - points[0][0]) * 0.82;
  const fontSize = Math.max(10, Math.min(15, width / Math.max(8, String(text).length * 0.52)));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f8fafc';
  ctx.shadowColor = '#07111d';
  ctx.shadowBlur = 3;
  const lines = wrapText(ctx, text, width).slice(0, 3);
  const lineHeight = fontSize * 1.18;
  let y = centerY - ((lines.length - 1) * lineHeight) / 2;
  for (const line of lines) {
    ctx.fillText(line, centerX, y, width);
    y += lineHeight;
  }
  ctx.shadowBlur = 0;
  ctx.textBaseline = 'alphabetic';
}

function drawRobot(ctx) {
  let x;
  let y;
  let jumping = state === 'jump' || state === 'advance';
  if (state === 'jump') {
    const startDepth = current === 0 ? 0.91 : choiceDepth(current);
    const startX = current === 0 ? W / 2 : laneX(previousSide, startDepth);
    const targetDepth = choiceDepth(current);
    x = startX + (laneX(selectedSide, targetDepth) - startX) * jumpProgress;
    y = bridgeY(startDepth) + (bridgeY(targetDepth) - bridgeY(startDepth)) * jumpProgress;
  } else if (state === 'advance') {
    const targetDepth = choiceDepth(current);
    x = laneX(previousSide, targetDepth);
    y = bridgeY(jumpStartDepth) + (bridgeY(targetDepth) - bridgeY(jumpStartDepth)) * jumpProgress;
  } else if (current === 0) {
    x = W / 2;
    y = bridgeY(0.91);
  } else {
    const depth = choiceDepth(current);
    x = laneX(previousSide, depth);
    y = bridgeY(depth);
  }
  const jump = jumping ? Math.sin(jumpProgress * Math.PI) * H * 0.13 : 0;
  const scale = Math.max(0.65, Math.min(1, W / 390));
  const falling = state === 'feedback' && !lastCorrect;
  ctx.save();
  ctx.translate(x, y - jump + (falling ? feedbackTimer * H * 0.18 : 0));
  if (jumping) ctx.rotate((selectedSide ? 1 : -1) * Math.sin(jumpProgress * Math.PI) * 0.18);
  if (falling) ctx.rotate(-0.35);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 22, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a5f3fc';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-9, -15);
  ctx.lineTo(-13, -3);
  ctx.moveTo(9, -15);
  ctx.lineTo(13, -3);
  ctx.moveTo(-8, -42);
  ctx.lineTo(-15, -32);
  ctx.moveTo(8, -42);
  ctx.lineTo(15, -32);
  ctx.stroke();

  ctx.fillStyle = '#dbeafe';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  roundedRect(ctx, -17, -58, 34, 27, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-10, -49, 5, 5);
  ctx.fillRect(5, -49, 5, 5);
  ctx.fillStyle = '#67e8f9';
  ctx.fillRect(-5, -38, 10, 2);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  roundedRect(ctx, -13, -29, 26, 20, 5);
  ctx.fillStyle = '#64748b';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(0, -19, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function render(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#050914');
  sky.addColorStop(0.46, '#10243a');
  sky.addColorStop(1, '#07111d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  drawStars(ctx);
  drawQuestion(ctx);
  drawBridge(ctx);
  drawRobot(ctx);

  if (finished) {
    ctx.fillStyle = 'rgba(3, 9, 20, 0.78)';
    ctx.fillRect(0, H * 0.36, W, H * 0.27);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = correct === questions.length ? '#86efac' : '#fecaca';
    ctx.font = `bold ${Math.max(24, W * 0.075)}px sans-serif`;
    ctx.fillText(correct === questions.length ? 'BRIDGE CLEARED!' : 'ROBOT FELL!', W / 2, H * 0.47);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `${Math.max(16, W * 0.045)}px sans-serif`;
    ctx.fillText(`${correct} of ${questions.length} correct`, W / 2, H * 0.54);
  }
}

function resize(width, height) {
  W = width;
  H = height;
}

registerGame({ init, update, render, resize });
