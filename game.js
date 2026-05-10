const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const timeValue = document.querySelector("#timeValue");
const scoreValue = document.querySelector("#scoreValue");
const livesValue = document.querySelector("#livesValue");
const comboValue = document.querySelector("#comboValue");
const startOverlay = document.querySelector("#startOverlay");
const countdown = document.querySelector("#countdown");
const countdownValue = document.querySelector("#countdownValue");
const freezeTimer = document.querySelector("#freezeTimer");
const freezeTimeValue = document.querySelector("#freezeTimeValue");
const scoreDisplay = document.querySelector(".score-display");
const playWrap = document.querySelector(".play-wrap");
const streakToast = document.querySelector("#streakToast");
const streakValue = document.querySelector("#streakValue");
const goalScore = document.querySelector("#goalScore");
const goalCombo = document.querySelector("#goalCombo");
const goalGold = document.querySelector("#goalGold");
const resultLine = document.querySelector("#resultLine");
const startButton = document.querySelector("#startButton");
const difficultyButtons = [...document.querySelectorAll(".difficulty-button")];

const colors = ["#ef3340", "#ffcf24", "#2f80ed", "#2cc36b", "#ff8a1c", "#9b5cff"];
const bottomSpawnBuffer = 96;
const comboWindow = 1600;
const rushEvery = 18000;
const rushDuration = 5200;
const freezeDuration = 5000;
const iceTexture = loadImage("assets/ice-texture.jpg");

const difficultySettings = {
  easy: {
    lives: 3,
    startRadius: 58,
    minRadius: 12,
    shrinkPerSecond: 15,
    spawnEvery: 1220,
    maxCircles: 4,
    slope: 0.018,
  },
  medium: {
    lives: 2,
    startRadius: 52,
    minRadius: 11,
    shrinkPerSecond: 19,
    spawnEvery: 1040,
    maxCircles: 5,
    slope: 0.024,
  },
  hard: {
    lives: 1,
    startRadius: 47,
    minRadius: 10,
    shrinkPerSecond: 23,
    spawnEvery: 900,
    maxCircles: 6,
    slope: 0.031,
  },
};

let selectedDifficulty = "easy";
let circles = [];
let popEffects = [];
let stains = [];
let lastFrame = 0;
let lastSpawn = 0;
let startedAt = 0;
let score = 0;
let popped = 0;
let lives = 3;
let combo = 0;
let bestCombo = 0;
let lastPopAt = 0;
let frozenUntil = 0;
let nextRushAt = 0;
let rushEndsAt = 0;
let nextBeatAt = 0;
let audioContext = null;
let gameState = "idle";
let animationFrame = 0;
let countdownTimer = 0;
let nextStreakTarget = 25;
let streakTimer = 0;
let lowSpawnUntil = 0;

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(bounds.width * pixelRatio);
  canvas.height = Math.floor(bounds.height * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function elapsedSeconds(now) {
  return Math.max(0, (now - startedAt) / 1000);
}

function formatTime(seconds) {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remaining = String(whole % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function currentPressure(now) {
  const settings = difficultySettings[selectedDifficulty];
  return 1 + elapsedSeconds(now) * settings.slope;
}

function isRushActive(now) {
  return now < rushEndsAt;
}

function chooseCircleType(now) {
  if (isRushActive(now)) return Math.random() < 0.16 ? "danger" : "normal";

  const roll = Math.random();
  if (roll < 0.055) return "gold";
  if (roll < 0.095) return "freeze";
  if (roll < 0.13) return "bomb";
  if (roll < 0.18) return "danger";
  return "normal";
}

function specialColor(type) {
  const palette = {
    normal: colors[Math.floor(Math.random() * colors.length)],
    gold: "#ffbf16",
    freeze: "#73d9ff",
    bomb: "#202735",
    danger: "#ff3b30",
  };

  return palette[type];
}

function spawnCircle(now, forcedType = null) {
  const settings = difficultySettings[selectedDifficulty];
  const maxCircles = settings.maxCircles + (isRushActive(now) ? 2 : 0);
  if (circles.length >= maxCircles) return;

  const type = forcedType || chooseCircleType(now);
  const radius = settings.startRadius;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const margin = radius + 8;
  const maxY = Math.max(margin, height - margin - bottomSpawnBuffer);
  const shouldSpawnLow = now < lowSpawnUntil;
  const zones = reservedSpawnZones(shouldSpawnLow);
  const minY = shouldSpawnLow ? Math.min(maxY, Math.max(margin, height * 0.48)) : margin;
  let x = randomBetween(margin, Math.max(margin, width - margin));
  let y = randomBetween(minY, maxY);

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const candidateX = randomBetween(margin, Math.max(margin, width - margin));
    const candidateY = randomBetween(minY, maxY);

    if (!zones.some((zone) => circleIntersectsRect(candidateX, candidateY, radius, zone))) {
      x = candidateX;
      y = candidateY;
      break;
    }
  }

  circles.push({
    x,
    y,
    radius,
    baseRadius: radius,
    minRadius: settings.minRadius,
    shrinkPerSecond:
      settings.shrinkPerSecond *
      currentPressure(now) *
      (type === "danger" ? 1.38 : 1) *
      (isRushActive(now) ? 0.78 : 1),
    color: specialColor(type),
    createdAt: now,
    type,
    seed: Math.random() * 1000,
  });
}

function reservedSpawnZones(includeStreakZone) {
  const canvasBox = canvas.getBoundingClientRect();
  const scoreBox = scoreDisplay.getBoundingClientRect();
  const zones = [relativeZone(scoreBox, canvasBox, 42)];

  if (includeStreakZone) {
    zones.push({
      left: canvas.clientWidth * 0.12,
      right: canvas.clientWidth * 0.88,
      top: 0,
      bottom: canvas.clientHeight * 0.38,
    });
  }

  return zones;
}

function relativeZone(box, parentBox, padding) {
  return {
    left: box.left - parentBox.left - padding,
    right: box.right - parentBox.left + padding,
    top: box.top - parentBox.top - padding,
    bottom: box.bottom - parentBox.top + padding,
  };
}

function circleIntersectsRect(x, y, radius, rect) {
  const closestX = Math.max(rect.left, Math.min(x, rect.right));
  const closestY = Math.max(rect.top, Math.min(y, rect.bottom));
  return Math.hypot(x - closestX, y - closestY) < radius;
}

function randomBetween(min, max) {
  if (max <= min) return min;
  return min + Math.random() * (max - min);
}

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

function drawCircle(circle) {
  const highlightX = circle.x - circle.radius * 0.32;
  const highlightY = circle.y - circle.radius * 0.38;
  const bodyGradient = createBallGradient(circle, highlightX, highlightY);

  ctx.save();
  ctx.shadowBlur = circle.type === "normal" ? 9 : 18;
  ctx.shadowColor = circle.type === "normal" ? "rgba(16, 24, 40, 0.16)" : glowColor(circle.type);
  ctx.beginPath();
  ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
  ctx.fillStyle = bodyGradient;
  ctx.fill();

  if (circle.type === "freeze") {
    drawIceTexture(circle);
  }

  if (circle.type === "gold") {
    drawMetallicShine(circle);
  }

  if (circle.type === "danger") {
    drawHazardIcon(circle);
  }

  if (circle.type === "bomb") {
    drawBombDetails(circle);
  }

  if (circle.type !== "bomb" && circle.type !== "danger") {
    drawGloss(circle, highlightX, highlightY);
  }
  ctx.restore();
}

function createBallGradient(circle, highlightX, highlightY) {
  const gradient =
    circle.type === "gold"
      ? ctx.createLinearGradient(
          circle.x - circle.radius,
          circle.y - circle.radius,
          circle.x + circle.radius,
          circle.y + circle.radius,
        )
      : ctx.createRadialGradient(
          highlightX,
          highlightY,
          circle.radius * 0.12,
          circle.x,
          circle.y,
          circle.radius,
        );

  if (circle.type === "gold") {
    gradient.addColorStop(0, "#a66a00");
    gradient.addColorStop(0.22, "#f6bd35");
    gradient.addColorStop(0.42, "#fff0a0");
    gradient.addColorStop(0.58, "#d8920a");
    gradient.addColorStop(0.78, "#f0b42b");
    gradient.addColorStop(1, "#8d5600");
    return gradient;
  }

  if (circle.type === "freeze") {
    gradient.addColorStop(0, "#f8feff");
    gradient.addColorStop(0.34, "#b9f0ff");
    gradient.addColorStop(0.72, "#69cbea");
    gradient.addColorStop(1, "#3b9fcb");
    return gradient;
  }

  if (circle.type === "bomb") {
    gradient.addColorStop(0, "#6b7280");
    gradient.addColorStop(0.34, "#202735");
    gradient.addColorStop(1, "#080b12");
    return gradient;
  }

  if (circle.type === "danger") {
    gradient.addColorStop(0, "#ff7b4d");
    gradient.addColorStop(0.42, "#ff3b30");
    gradient.addColorStop(1, "#95180f");
    return gradient;
  }

  gradient.addColorStop(0, lightenColor(circle.color, 0.36));
  gradient.addColorStop(0.34, circle.color);
  gradient.addColorStop(1, darkenColor(circle.color, 0.12));
  return gradient;
}

function glowColor(type) {
  const glows = {
    gold: "rgba(255, 191, 22, 0.46)",
    freeze: "rgba(115, 217, 255, 0.48)",
    bomb: "rgba(32, 39, 53, 0.38)",
    danger: "rgba(255, 59, 48, 0.44)",
  };

  return glows[type] || "rgba(16, 24, 40, 0.16)";
}

function drawGloss(circle, highlightX, highlightY) {
  const glossGradient = ctx.createRadialGradient(
    highlightX,
    highlightY,
    0,
    highlightX,
    highlightY,
    circle.radius * 0.48,
  );
  glossGradient.addColorStop(0, "rgba(255, 255, 255, 0.44)");
  glossGradient.addColorStop(0.42, "rgba(255, 255, 255, 0.18)");
  glossGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.beginPath();
  ctx.ellipse(
    highlightX,
    highlightY,
    circle.radius * 0.3,
    circle.radius * 0.2,
    -0.55,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = glossGradient;
  ctx.fill();
}

function drawMetallicShine(circle) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.48;
  ctx.strokeStyle = "#fff2a4";
  ctx.lineWidth = Math.max(2, circle.radius * 0.05);
  ctx.beginPath();
  ctx.arc(circle.x - circle.radius * 0.06, circle.y - circle.radius * 0.05, circle.radius * 0.58, -2.85, -0.16);
  ctx.stroke();

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#fff7bd";
  ctx.beginPath();
  ctx.ellipse(circle.x - circle.radius * 0.34, circle.y - circle.radius * 0.34, circle.radius * 0.28, circle.radius * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.32;
  ctx.strokeStyle = "#7d4c00";
  ctx.lineWidth = Math.max(1.5, circle.radius * 0.035);
  ctx.beginPath();
  ctx.arc(circle.x, circle.y, circle.radius * 0.9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawIceTexture(circle) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
  ctx.clip();

  if (iceTexture.complete && iceTexture.naturalWidth > 0) {
    ctx.globalAlpha = 0.38;
    const size = circle.radius * 2.35;
    ctx.drawImage(
      iceTexture,
      circle.x - size / 2 + Math.sin(circle.seed) * circle.radius * 0.15,
      circle.y - size / 2 + Math.cos(circle.seed) * circle.radius * 0.15,
      size,
      size,
    );
  } else {
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(circle.x - circle.radius, circle.y - circle.radius, circle.radius * 2, circle.radius * 2);
  }

  ctx.globalAlpha = 0.1;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(circle.x - circle.radius, circle.y - circle.radius, circle.radius * 2, circle.radius * 2);
  ctx.restore();
}

function drawBombDetails(circle) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.roundRect(
    circle.x - circle.radius * 0.18,
    circle.y - circle.radius * 0.88,
    circle.radius * 0.36,
    circle.radius * 0.22,
    circle.radius * 0.06,
  );
  ctx.fill();

  ctx.strokeStyle = "#5b3a19";
  ctx.lineWidth = Math.max(3, circle.radius * 0.07);
  ctx.beginPath();
  ctx.moveTo(circle.x + circle.radius * 0.08, circle.y - circle.radius * 0.78);
  ctx.bezierCurveTo(
    circle.x + circle.radius * 0.28,
    circle.y - circle.radius * 1.08,
    circle.x + circle.radius * 0.52,
    circle.y - circle.radius * 0.95,
    circle.x + circle.radius * 0.58,
    circle.y - circle.radius * 1.22,
  );
  ctx.stroke();

  ctx.fillStyle = "#ffcf24";
  ctx.beginPath();
  ctx.arc(circle.x + circle.radius * 0.6, circle.y - circle.radius * 1.24, circle.radius * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
  ctx.beginPath();
  ctx.ellipse(circle.x - circle.radius * 0.28, circle.y - circle.radius * 0.28, circle.radius * 0.22, circle.radius * 0.14, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHazardIcon(circle) {
  ctx.save();
  ctx.fillStyle = "#ffd45c";
  ctx.strokeStyle = "#30343b";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, circle.radius * 0.08);
  ctx.beginPath();
  ctx.moveTo(circle.x, circle.y - circle.radius * 0.51);
  ctx.lineTo(circle.x + circle.radius * 0.54, circle.y + circle.radius * 0.42);
  ctx.lineTo(circle.x - circle.radius * 0.54, circle.y + circle.radius * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.beginPath();
  ctx.moveTo(circle.x - circle.radius * 0.36, circle.y + circle.radius * 0.31);
  ctx.quadraticCurveTo(circle.x - circle.radius * 0.18, circle.y - circle.radius * 0.28, circle.x + circle.radius * 0.37, circle.y + circle.radius * 0.24);
  ctx.lineTo(circle.x - circle.radius * 0.36, circle.y + circle.radius * 0.31);
  ctx.fill();

  ctx.fillStyle = "#30343b";
  ctx.beginPath();
  ctx.roundRect(circle.x - circle.radius * 0.055, circle.y - circle.radius * 0.29, circle.radius * 0.11, circle.radius * 0.38, circle.radius * 0.045);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(circle.x, circle.y + circle.radius * 0.25, circle.radius * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function lightenColor(hex, amount) {
  return mixColor(hex, "#ffffff", amount);
}

function darkenColor(hex, amount) {
  return mixColor(hex, "#000000", amount);
}

function mixColor(hex, target, amount) {
  const source = hexToRgb(hex);
  const destination = hexToRgb(target);
  const mixed = {
    r: Math.round(source.r + (destination.r - source.r) * amount),
    g: Math.round(source.g + (destination.g - source.g) * amount),
    b: Math.round(source.b + (destination.b - source.b) * amount),
  };

  return `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function createPopEffect(circle, now) {
  const fragments = Array.from({ length: 12 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 12 + randomBetween(-0.18, 0.18);
    const speed = randomBetween(120, 230);

    return {
      angle,
      speed,
      size: randomBetween(4, 8),
      drift: randomBetween(-0.4, 0.4),
    };
  });

  popEffects.push({
    x: circle.x,
    y: circle.y,
    color: circle.color,
    radius: circle.radius,
    startedAt: now,
    duration: 420,
    fragments,
  });
}

function createStain(circle, now) {
  const splats = Array.from({ length: 9 }, () => {
    const angle = randomBetween(0, Math.PI * 2);
    const distance = randomBetween(0, circle.radius * 0.72);

    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      radiusX: randomBetween(circle.radius * 0.16, circle.radius * 0.42),
      radiusY: randomBetween(circle.radius * 0.08, circle.radius * 0.28),
      rotation: randomBetween(0, Math.PI),
      alpha: randomBetween(0.2, 0.44),
    };
  });

  stains.push({
    x: circle.x,
    y: circle.y,
    color: circle.color,
    radius: circle.radius,
    startedAt: now,
    duration: 10000,
    fadeDuration: 3600,
    splats,
  });
}

function drawStain(stain, now) {
  const age = now - stain.startedAt;
  const holdTime = Math.max(0, stain.duration - stain.fadeDuration);
  const fadeProgress = Math.min(1, Math.max(0, age - holdTime) / stain.fadeDuration);
  const alpha = 1 - fadeProgress;

  ctx.save();
  ctx.globalCompositeOperation = "multiply";

  stain.splats.forEach((splat) => {
    ctx.globalAlpha = alpha * splat.alpha * 0.18;
    ctx.beginPath();
    ctx.ellipse(
      stain.x + splat.x,
      stain.y + splat.y,
      splat.radiusX,
      splat.radiusY,
      splat.rotation,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = stain.color;
    ctx.fill();
  });

  ctx.globalAlpha = alpha * 0.05;
  ctx.beginPath();
  ctx.arc(stain.x, stain.y, stain.radius * 0.88, 0, Math.PI * 2);
  ctx.fillStyle = stain.color;
  ctx.fill();
  ctx.restore();
}

function drawPopEffect(effect, now) {
  const progress = Math.min(1, (now - effect.startedAt) / effect.duration);
  const easeOut = 1 - Math.pow(1 - progress, 3);
  const fade = 1 - progress;

  ctx.save();
  ctx.globalAlpha = fade;

  effect.fragments.forEach((fragment) => {
    const distance = fragment.speed * easeOut * 0.34;
    const wobble = Math.sin(progress * Math.PI) * fragment.drift * 12;
    const x = effect.x + Math.cos(fragment.angle) * distance + wobble;
    const y = effect.y + Math.sin(fragment.angle) * distance - progress * 16;

    ctx.beginPath();
    ctx.arc(x, y, fragment.size * fade, 0, Math.PI * 2);
    ctx.fillStyle = effect.color;
    ctx.fill();
  });

  ctx.restore();
}

function drawBackground() {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
}

function update(now) {
  if (gameState !== "playing") return;

  const delta = Math.min(0.04, (now - lastFrame) / 1000 || 0);
  lastFrame = now;

  const settings = difficultySettings[selectedDifficulty];
  const pressure = currentPressure(now);
  const rushActive = isRushActive(now);
  const spawnEvery = Math.max(rushActive ? 300 : 480, settings.spawnEvery / pressure / (rushActive ? 1.65 : 1));

  if (now >= nextRushAt) {
    rushEndsAt = now + rushDuration;
    nextRushAt = now + rushEvery;
    lowSpawnUntil = now + 1200;
    showToast("RUSH");
    shakeScreen();
    playTone(180, 0.09, "sawtooth", 0.03);
  }

  if (combo > 0 && now - lastPopAt > comboWindow) {
    resetCombo();
  }

  if (now - lastSpawn >= spawnEvery || circles.length === 0) {
    spawnCircle(now);
    lastSpawn = now;
  }

  if (now >= frozenUntil) {
    circles.forEach((circle) => {
      circle.radius -= circle.shrinkPerSecond * delta;
    });
  }

  popEffects = popEffects.filter((effect) => now - effect.startedAt <= effect.duration);
  stains = stains.filter((stain) => now - stain.startedAt <= stain.duration);

  const expired = circles.filter((circle) => circle.radius <= circle.minRadius);
  if (expired.length > 0) {
    handleMiss(1);
    circles = circles.filter((circle) => circle.radius > circle.minRadius);
  }

  if (lives <= 0) {
    endGame();
    return;
  }

  timeValue.textContent = formatTime(elapsedSeconds(now));
  scoreValue.textContent = score;
  livesValue.textContent = lives;
  comboValue.textContent = `${combo}x`;
  updateFreezeTimer(now);
  playBeat(now);

  drawBackground();
  stains.forEach((stain) => drawStain(stain, now));
  popEffects.forEach((effect) => drawPopEffect(effect, now));
  circles.sort((a, b) => b.radius - a.radius).forEach(drawCircle);

  animationFrame = requestAnimationFrame(update);
}

function startGame() {
  cancelAnimationFrame(animationFrame);
  clearInterval(countdownTimer);
  initAudio();
  resizeCanvas();
  circles = [];
  popEffects = [];
  stains = [];
  score = 0;
  popped = 0;
  combo = 0;
  bestCombo = 0;
  lastPopAt = 0;
  lives = difficultySettings[selectedDifficulty].lives;
  frozenUntil = 0;
  rushEndsAt = 0;
  nextRushAt = 0;
  nextBeatAt = 0;
  nextStreakTarget = 25;
  lowSpawnUntil = 0;
  gameState = "countdown";
  scoreValue.textContent = "0";
  livesValue.textContent = lives;
  comboValue.textContent = "0x";
  timeValue.textContent = "0:00";
  hideFreezeTimer();
  hideStreak();
  resetGoals();
  drawBackground();
  startOverlay.classList.remove("is-visible");
  runCountdown();
}

function runCountdown() {
  let count = 3;
  countdownValue.textContent = count;
  countdown.classList.add("is-visible");
  countdown.setAttribute("aria-hidden", "false");
  restartCountdownAnimation();

  countdownTimer = window.setInterval(() => {
    count -= 1;

    if (count <= 0) {
      clearInterval(countdownTimer);
      countdown.classList.remove("is-visible");
      countdown.setAttribute("aria-hidden", "true");
      beginPlay();
      return;
    }

    countdownValue.textContent = count;
    restartCountdownAnimation();
  }, 900);
}

function restartCountdownAnimation() {
  countdownValue.classList.add("is-changing");
  countdownValue.offsetHeight;
  countdownValue.classList.remove("is-changing");
}

function beginPlay() {
  startedAt = performance.now();
  lastFrame = startedAt;
  lastSpawn = startedAt;
  nextRushAt = startedAt + 9000;
  nextBeatAt = startedAt + 450;
  gameState = "playing";
  spawnCircle(startedAt);
  animationFrame = requestAnimationFrame(update);
}

function endGame() {
  gameState = "ended";
  cancelAnimationFrame(animationFrame);
  clearInterval(countdownTimer);
  clearTimeout(streakTimer);
  countdown.classList.remove("is-visible");
  countdown.setAttribute("aria-hidden", "true");
  hideFreezeTimer();
  drawBackground();
  stains.forEach((stain) => drawStain(stain, performance.now()));
  popEffects.forEach((effect) => drawPopEffect(effect, performance.now()));
  circles.forEach(drawCircle);
  playGameOverSound();
  resultLine.textContent = `Game over. Score ${score}. You popped ${popped} ${popped === 1 ? "circle" : "circles"}.`;
  startButton.textContent = "Play Again";
  startOverlay.classList.add("is-visible");
}

function popCircle(event) {
  if (gameState !== "playing") return;

  const bounds = canvas.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;

  const hitIndex = circles
    .map((circle, index) => ({
      index,
      distance: Math.hypot(circle.x - x, circle.y - y),
      radius: circle.radius,
    }))
    .filter((hit) => hit.distance <= hit.radius)
    .sort((a, b) => a.radius - b.radius)[0]?.index;

  if (hitIndex === undefined) {
    handleMissClick();
    return;
  }

  const [poppedCircle] = circles.splice(hitIndex, 1);
  const now = performance.now();
  createStain(poppedCircle, now);
  createPopEffect(poppedCircle, now);
  popped += 1;
  combo += 1;
  bestCombo = Math.max(bestCombo, combo);
  lastPopAt = now;

  const popScore = scoreForCircle(poppedCircle);
  score += popScore;
  scoreValue.textContent = score;
  comboValue.textContent = `${combo}x`;
  animateScore();
  applySpecialBall(poppedCircle, now);
  scoreValue.textContent = score;
  updateGoals(poppedCircle);
  maybeShowPopCallout(poppedCircle, popScore);
  maybeShowStreak();
  playPopSound(poppedCircle, popScore);
}

function scoreForCircle(circle) {
  const sizeRatio = circle.radius / circle.baseRadius;
  let points = 1;

  if (sizeRatio < 0.3) points = 5;
  else if (sizeRatio < 0.48) points = 3;
  else if (sizeRatio < 0.72) points = 2;

  if (circle.type === "gold") points += 5;
  if (circle.type === "danger") points += 6;
  if (circle.type === "bomb") points += 2;

  return points + Math.floor(combo / 10);
}

function applySpecialBall(circle, now) {
  if (circle.type === "freeze") {
    frozenUntil = now + freezeDuration;
    updateFreezeTimer(now);
    showToast("FREEZE 5s");
    playTone(520, 0.18, "triangle", 0.05);
  }

  if (circle.type === "bomb") {
    const bonus = circles.length;
    circles.forEach((item) => {
      createStain(item, now);
      createPopEffect(item, now);
    });
    popped += bonus;
    score += bonus * 2;
    circles = [];
    showToast("BLAST");
    shakeScreen();
    playTone(90, 0.18, "sawtooth", 0.06);
  }

  if (circle.type === "danger") {
    shakeScreen();
  }
}

function updateFreezeTimer(now) {
  const remaining = Math.max(0, frozenUntil - now);

  if (remaining <= 0) {
    hideFreezeTimer();
    return;
  }

  freezeTimeValue.textContent = (remaining / 1000).toFixed(1);
  freezeTimer.classList.add("is-visible");
  freezeTimer.setAttribute("aria-hidden", "false");
}

function hideFreezeTimer() {
  freezeTimer.classList.remove("is-visible");
  freezeTimer.setAttribute("aria-hidden", "true");
}

function maybeShowPopCallout(circle, points) {
  const sizeRatio = circle.radius / circle.baseRadius;
  if (sizeRatio < 0.3) {
    showToast(`CLUTCH +${points}`);
    shakeScreen();
  } else if (points >= 7) {
    showToast(`+${points}`);
  }
}

function animateScore() {
  scoreDisplay.classList.remove("is-popping");
  scoreDisplay.offsetHeight;
  scoreDisplay.classList.add("is-popping");
}

function maybeShowStreak() {
  if (combo < nextStreakTarget) return;

  showStreak(nextStreakTarget);
  nextStreakTarget = nextStreakTarget < 100 ? nextStreakTarget + 25 : nextStreakTarget + 50;
}

function showStreak(amount) {
  showToast(`${amount} STREAK`);
  shakeScreen();
  playStreakSound();
}

function showToast(message) {
  clearTimeout(streakTimer);
  lowSpawnUntil = performance.now() + 1250;
  streakValue.textContent = message;
  streakToast.classList.remove("is-visible");
  streakValue.classList.remove("is-changing");
  streakToast.offsetHeight;
  streakToast.classList.add("is-visible");
  streakToast.setAttribute("aria-hidden", "false");
  streakValue.classList.add("is-changing");

  streakTimer = window.setTimeout(hideStreak, 1100);
}

function hideStreak() {
  clearTimeout(streakTimer);
  streakToast.classList.remove("is-visible");
  streakToast.setAttribute("aria-hidden", "true");
  streakValue.classList.remove("is-changing");
}

function handleMiss(amount) {
  lives = Math.max(0, lives - amount);
  livesValue.textContent = lives;
  resetCombo();
  showToast(lives > 0 ? "MISS" : "OUT");
  shakeScreen();
  playTone(140, 0.16, "square", 0.04);
}

function handleMissClick() {
  resetCombo();
}

function resetCombo() {
  combo = 0;
  nextStreakTarget = 25;
  comboValue.textContent = "0x";
}

function resetGoals() {
  [goalScore, goalCombo, goalGold].forEach((goal) => goal.classList.remove("is-complete"));
}

function updateGoals(circle) {
  if (score >= 50) goalScore.classList.add("is-complete");
  if (bestCombo >= 10) goalCombo.classList.add("is-complete");
  if (circle.type === "gold") goalGold.classList.add("is-complete");
}

function shakeScreen() {
  playWrap.classList.remove("is-shaking");
  playWrap.offsetHeight;
  playWrap.classList.add("is-shaking");
}

function initAudio() {
  if (audioContext) {
    audioContext.resume?.();
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext = new AudioContextClass();
  audioContext.resume?.();
}

function playTone(frequency, duration, type = "sine", volume = 0.04) {
  if (!audioContext) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playPopSound(circle, points) {
  const base = circle.type === "danger" ? 350 : 460;
  playTone(base + Math.min(points, 12) * 22, 0.07, "triangle", 0.045);
  window.setTimeout(() => playTone(720 + combo * 4, 0.045, "sine", 0.025), 35);
}

function playStreakSound() {
  playTone(620, 0.08, "triangle", 0.045);
  window.setTimeout(() => playTone(840, 0.09, "triangle", 0.045), 80);
}

function playGameOverSound() {
  playTone(220, 0.12, "sawtooth", 0.04);
  window.setTimeout(() => playTone(150, 0.2, "sawtooth", 0.035), 120);
}

function playBeat(now) {
  if (!audioContext || now < nextBeatAt) return;

  const pressure = currentPressure(now);
  const interval = Math.max(280, 620 / pressure);
  nextBeatAt = now + interval;
  playTone(isRushActive(now) ? 260 : 210, 0.035, "square", isRushActive(now) ? 0.018 : 0.011);
}

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedDifficulty = button.dataset.difficulty;
    difficultyButtons.forEach((item) => item.classList.toggle("is-selected", item === button));
    if (gameState !== "playing" && gameState !== "countdown") {
      resultLine.textContent = "Choose a difficulty and start popping.";
      startButton.textContent = "Start Game";
    }
  });
});

startButton.addEventListener("click", startGame);
canvas.addEventListener("pointerdown", popCircle);
window.addEventListener("resize", () => {
  resizeCanvas();
  if (gameState !== "playing") {
    drawBackground();
  }
});

resizeCanvas();
drawBackground();
