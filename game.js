const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const timeValue = document.querySelector("#timeValue");
const scoreValue = document.querySelector("#scoreValue");
const startOverlay = document.querySelector("#startOverlay");
const countdown = document.querySelector("#countdown");
const countdownValue = document.querySelector("#countdownValue");
const scoreDisplay = document.querySelector(".score-display");
const streakToast = document.querySelector("#streakToast");
const streakValue = document.querySelector("#streakValue");
const resultLine = document.querySelector("#resultLine");
const startButton = document.querySelector("#startButton");
const difficultyButtons = [...document.querySelectorAll(".difficulty-button")];

const colors = ["#ef3340", "#ffcf24", "#2f80ed", "#2cc36b", "#ff8a1c", "#9b5cff"];

const difficultySettings = {
  easy: {
    startRadius: 58,
    minRadius: 12,
    shrinkPerSecond: 15,
    spawnEvery: 1220,
    maxCircles: 4,
    slope: 0.018,
  },
  medium: {
    startRadius: 52,
    minRadius: 11,
    shrinkPerSecond: 19,
    spawnEvery: 1040,
    maxCircles: 5,
    slope: 0.024,
  },
  hard: {
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

function spawnCircle(now) {
  const settings = difficultySettings[selectedDifficulty];
  if (circles.length >= settings.maxCircles) return;

  const radius = settings.startRadius;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const margin = radius + 8;
  const shouldSpawnLow = now < lowSpawnUntil;
  const zones = reservedSpawnZones(shouldSpawnLow);
  const minY = shouldSpawnLow ? Math.max(margin, height * 0.48) : margin;
  let x = randomBetween(margin, Math.max(margin, width - margin));
  let y = randomBetween(minY, Math.max(minY, height - margin));

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const candidateX = randomBetween(margin, Math.max(margin, width - margin));
    const candidateY = randomBetween(minY, Math.max(minY, height - margin));

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
    shrinkPerSecond: settings.shrinkPerSecond * currentPressure(now),
    color: colors[Math.floor(Math.random() * colors.length)],
    createdAt: now,
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

function drawCircle(circle) {
  const highlightX = circle.x - circle.radius * 0.32;
  const highlightY = circle.y - circle.radius * 0.38;
  const bodyGradient = ctx.createRadialGradient(
    highlightX,
    highlightY,
    circle.radius * 0.12,
    circle.x,
    circle.y,
    circle.radius,
  );
  bodyGradient.addColorStop(0, lightenColor(circle.color, 0.36));
  bodyGradient.addColorStop(0.34, circle.color);
  bodyGradient.addColorStop(1, darkenColor(circle.color, 0.12));

  ctx.save();
  ctx.shadowBlur = 9;
  ctx.shadowColor = "rgba(16, 24, 40, 0.16)";
  ctx.beginPath();
  ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
  ctx.fillStyle = bodyGradient;
  ctx.fill();

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
  const spawnEvery = Math.max(480, settings.spawnEvery / pressure);

  if (now - lastSpawn >= spawnEvery || circles.length === 0) {
    spawnCircle(now);
    lastSpawn = now;
  }

  circles.forEach((circle) => {
    circle.radius -= circle.shrinkPerSecond * delta;
  });
  popEffects = popEffects.filter((effect) => now - effect.startedAt <= effect.duration);
  stains = stains.filter((stain) => now - stain.startedAt <= stain.duration);

  if (circles.some((circle) => circle.radius <= circle.minRadius)) {
    endGame();
    return;
  }

  timeValue.textContent = formatTime(elapsedSeconds(now));
  scoreValue.textContent = score;

  drawBackground();
  stains.forEach((stain) => drawStain(stain, now));
  popEffects.forEach((effect) => drawPopEffect(effect, now));
  circles.sort((a, b) => b.radius - a.radius).forEach(drawCircle);

  animationFrame = requestAnimationFrame(update);
}

function startGame() {
  cancelAnimationFrame(animationFrame);
  clearInterval(countdownTimer);
  resizeCanvas();
  circles = [];
  popEffects = [];
  stains = [];
  score = 0;
  nextStreakTarget = 25;
  lowSpawnUntil = 0;
  gameState = "countdown";
  scoreValue.textContent = "0";
  timeValue.textContent = "0:00";
  hideStreak();
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
  drawBackground();
  stains.forEach((stain) => drawStain(stain, performance.now()));
  popEffects.forEach((effect) => drawPopEffect(effect, performance.now()));
  circles.forEach(drawCircle);
  resultLine.textContent = `Game over. You popped ${score} ${score === 1 ? "circle" : "circles"}.`;
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

  if (hitIndex === undefined) return;

  const [poppedCircle] = circles.splice(hitIndex, 1);
  const now = performance.now();
  createStain(poppedCircle, now);
  createPopEffect(poppedCircle, now);
  score += 1;
  scoreValue.textContent = score;
  animateScore();
  maybeShowStreak();
}

function animateScore() {
  scoreDisplay.classList.remove("is-popping");
  scoreDisplay.offsetHeight;
  scoreDisplay.classList.add("is-popping");
}

function maybeShowStreak() {
  if (score < nextStreakTarget) return;

  showStreak(nextStreakTarget);
  nextStreakTarget = nextStreakTarget < 100 ? nextStreakTarget + 25 : nextStreakTarget + 50;
}

function showStreak(amount) {
  clearTimeout(streakTimer);
  lowSpawnUntil = performance.now() + 1250;
  streakValue.textContent = `${amount} STREAK`;
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
