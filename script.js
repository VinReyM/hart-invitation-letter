// ---------- Elements ----------
const effectsLayer = document.getElementById("effects");
const card = document.getElementById("card");
const message = document.getElementById("message");
const subMessage = document.getElementById("subMessage");
const buttonRow = document.getElementById("buttons");
const yesButton = document.getElementById("yesButton");
const noButton = document.getElementById("noButton");

// ---------- Settings ----------
const COLORS = ["#ff7a9c", "#f03e5f", "#ffb3c6", "#c9184a", "#ffffff"];
const NO_MESSAGES = ["No", "Nice try!", "Too slow!", "Catch me!", "Nope!", "Try again!"];
const VIEWPORT_MARGIN = 10;      // minimum gap between the No button and the screen edge
const DODGE_DISTANCE = 70;       // how close the pointer can get before the button runs away
const DODGE_COOLDOWN_MS = 120;   // stops it from jittering while mid-flight
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let isCelebrating = false;
let hasStartedDodging = false;
let lastDodgeTime = 0;
// Where the No button is (or is heading), tracked so proximity checks ignore mid-flight positions
let noTarget = { x: 0, y: 0, width: 0, height: 0 };

const random = (min, max) => min + Math.random() * (max - min);

// ---------- Effect spawning ----------
function spawnEffect(className, styles) {
  const element = document.createElement("span");
  element.className = className;
  Object.entries(styles).forEach(([name, value]) => {
    name.startsWith("--") ? element.style.setProperty(name, value) : (element.style[name] = value);
  });
  effectsLayer.appendChild(element);
  element.addEventListener("animationend", () => element.remove(), { once: true });
  return element;
}

function spawnFloatingHeart(startAlreadyMidway = false) {
  const size = random(14, 38);
  spawnEffect("heart float-up-heart float-heart", {
    left: `${random(0, 100)}%`,
    width: `${size}px`,
    height: `${size}px`,
    color: COLORS[Math.floor(random(0, 4))],
    "--duration": `${random(9, 16)}s`,
    "--delay": startAlreadyMidway ? `-${random(0, 9)}s` : "0s",
    "--drift": `${random(-60, 60)}px`,
    "--spin": `${random(-40, 40)}deg`,
    "--peak": `${random(0.35, 0.7)}`,
  });
}

function spawnSparkle() {
  const size = random(8, 18);
  spawnEffect("sparkle", {
    left: `${random(0, 100)}%`,
    top: `${random(0, 100)}%`,
    width: `${size}px`,
    height: `${size}px`,
    "--duration": `${random(1.6, 3)}s`,
  });
}

function spawnRainHeart() {
  const size = random(16, 34);
  spawnEffect("heart rain-heart", {
    left: `${random(0, 100)}%`,
    width: `${size}px`,
    height: `${size}px`,
    color: COLORS[Math.floor(random(0, 4))],
    "--duration": `${random(3.5, 6.5)}s`,
    "--drift": `${random(-80, 80)}px`,
    "--spin": `${random(-120, 120)}deg`,
  });
}

function spawnConfetti() {
  spawnEffect("confetti", {
    left: `${random(0, 100)}%`,
    width: `${random(7, 11)}px`,
    height: `${random(12, 18)}px`,
    backgroundColor: COLORS[Math.floor(random(0, COLORS.length))],
    "--duration": `${random(3, 5.5)}s`,
    "--drift": `${random(-120, 120)}px`,
    "--spin": `${random(360, 900)}deg`,
  });
}

// ---------- Ambient background ----------
function startAmbientBackground() {
  for (let i = 0; i < 10; i++) spawnFloatingHeart(true);
  if (prefersReducedMotion) return;

  setInterval(() => { if (!document.hidden) spawnFloatingHeart(); }, 900);
  setInterval(() => { if (!document.hidden) spawnSparkle(); }, 700);
}

// ---------- No button: dodging ----------
function getViewportSize() {
  return { width: document.documentElement.clientWidth, height: window.innerHeight };
}

// Lift the button out of the card the first time it runs. It must live directly in <body>:
// the card's backdrop-filter would otherwise make "fixed" positions relative to the card.
// A spacer keeps the Yes button from shifting.
function makeNoButtonFloating() {
  const rect = noButton.getBoundingClientRect();

  const placeholder = document.createElement("span");
  placeholder.style.width = `${rect.width}px`;
  placeholder.style.height = `${rect.height}px`;
  buttonRow.insertBefore(placeholder, noButton);

  document.body.appendChild(noButton);
  noButton.classList.add("is-floating");
  noButton.style.left = `${rect.left}px`;
  noButton.style.top = `${rect.top}px`;
  noButton.getBoundingClientRect(); // flush styles so the first move animates

  noTarget = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  hasStartedDodging = true;
}

function rectsOverlap(a, b, padding) {
  return !(
    a.x + a.width + padding < b.x ||
    b.x + b.width + padding < a.x ||
    a.y + a.height + padding < b.y ||
    b.y + b.height + padding < a.y
  );
}

// Pick a spot fully inside the viewport, away from the pointer and the Yes button
function pickNewPosition(pointerX, pointerY) {
  const viewport = getViewportSize();
  const width = noButton.offsetWidth;
  const height = noButton.offsetHeight;
  const maxX = Math.max(VIEWPORT_MARGIN, viewport.width - width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, viewport.height - height - VIEWPORT_MARGIN);
  const minPointerDistance = Math.min(200, viewport.width / 3, viewport.height / 3);
  const yesRect = yesButton.getBoundingClientRect();
  const yesBox = { x: yesRect.left, y: yesRect.top, width: yesRect.width, height: yesRect.height };

  let bestCandidate = null;
  let bestDistance = -1;

  for (let attempt = 0; attempt < 30; attempt++) {
    const x = random(VIEWPORT_MARGIN, maxX);
    const y = random(VIEWPORT_MARGIN, maxY);
    const distance = Math.hypot(x + width / 2 - pointerX, y + height / 2 - pointerY);
    const overlapsYes = rectsOverlap({ x, y, width, height }, yesBox, 16);

    if (!overlapsYes && distance > bestDistance) {
      bestDistance = distance;
      bestCandidate = { x, y };
    }
    if (!overlapsYes && distance >= minPointerDistance) break;
  }

  return bestCandidate || { x: random(VIEWPORT_MARGIN, maxX), y: random(VIEWPORT_MARGIN, maxY) };
}

function dodge(pointerX, pointerY, { force = false } = {}) {
  if (isCelebrating) return;
  const now = performance.now();
  if (!force && now - lastDodgeTime < DODGE_COOLDOWN_MS) return;
  lastDodgeTime = now;

  if (!hasStartedDodging) makeNoButtonFloating();

  // Change the label first so the new size is used when picking a position
  if (Math.random() < 0.65) {
    const options = NO_MESSAGES.filter((text) => text !== noButton.textContent);
    noButton.textContent = options[Math.floor(Math.random() * options.length)];
  }

  const { x, y } = pickNewPosition(pointerX, pointerY);
  noButton.style.left = `${x}px`;
  noButton.style.top = `${y}px`;
  noTarget = { x, y, width: noButton.offsetWidth, height: noButton.offsetHeight };

  // Restart the wiggle animation with a random tilt
  noButton.style.setProperty("--tilt", `${random(10, 22)}deg`);
  noButton.classList.remove("is-dodging");
  void noButton.offsetWidth;
  noButton.classList.add("is-dodging");
}

function distanceToNoButton(pointerX, pointerY) {
  if (!hasStartedDodging) {
    const rect = noButton.getBoundingClientRect();
    noTarget = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }
  const dx = Math.max(noTarget.x - pointerX, 0, pointerX - (noTarget.x + noTarget.width));
  const dy = Math.max(noTarget.y - pointerY, 0, pointerY - (noTarget.y + noTarget.height));
  return Math.hypot(dx, dy);
}

// Mouse and pen: run away before the cursor even touches the button
document.addEventListener("pointermove", (event) => {
  if (isCelebrating) return;
  const threshold = event.pointerType === "touch" ? DODGE_DISTANCE * 1.5 : DODGE_DISTANCE;
  if (distanceToNoButton(event.clientX, event.clientY) < threshold) {
    dodge(event.clientX, event.clientY);
  }
});

// Direct hover always dodges, even if the cooldown is still running
noButton.addEventListener("pointerenter", (event) => {
  dodge(event.clientX, event.clientY, { force: true });
});

// Touch: move the button the instant a finger lands near it, before the tap can complete
document.addEventListener(
  "pointerdown",
  (event) => {
    if (isCelebrating) return;
    if (distanceToNoButton(event.clientX, event.clientY) < DODGE_DISTANCE) {
      dodge(event.clientX, event.clientY, { force: true });
    }
  },
  { passive: true }
);

noButton.addEventListener("touchstart", (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  dodge(touch.clientX, touch.clientY, { force: true });
}, { passive: false });

// A click (or keyboard press) that slips through just makes it dodge again
noButton.addEventListener("click", (event) => {
  event.preventDefault();
  const rect = noButton.getBoundingClientRect();
  dodge(event.clientX || rect.left + rect.width / 2, event.clientY || rect.top + rect.height / 2, { force: true });
});

// Keep the button on screen if the window is resized or rotated
function keepNoButtonInside() {
  if (!hasStartedDodging || isCelebrating) return;
  const viewport = getViewportSize();
  const maxX = Math.max(VIEWPORT_MARGIN, viewport.width - noButton.offsetWidth - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, viewport.height - noButton.offsetHeight - VIEWPORT_MARGIN);
  noTarget.x = Math.min(Math.max(noTarget.x, VIEWPORT_MARGIN), maxX);
  noTarget.y = Math.min(Math.max(noTarget.y, VIEWPORT_MARGIN), maxY);
  noButton.style.left = `${noTarget.x}px`;
  noButton.style.top = `${noTarget.y}px`;
}
window.addEventListener("resize", keepNoButtonInside);

// ---------- Yes button: celebration ----------
function celebrate() {
  if (isCelebrating) return;
  isCelebrating = true;

  buttonRow.hidden = true;
  yesButton.disabled = true;
  noButton.disabled = true;
  noButton.hidden = true;

  message.textContent = "YAY! I knew you'd say yes!";
  subMessage.hidden = false;
  card.classList.add("is-celebrating");

  if (prefersReducedMotion) {
    for (let i = 0; i < 12; i++) spawnRainHeart();
    return;
  }

  // Opening burst
  for (let i = 0; i < 28; i++) setTimeout(spawnRainHeart, i * 60);
  for (let i = 0; i < 40; i++) setTimeout(spawnConfetti, i * 45);
  for (let i = 0; i < 14; i++) setTimeout(spawnSparkle, i * 120);

  // Gentler continuous shower so it stays joyful without being overwhelming
  const showerStart = performance.now();
  const shower = setInterval(() => {
    if (performance.now() - showerStart > 9000) return clearInterval(shower);
    spawnRainHeart();
    spawnConfetti();
    spawnSparkle();
  }, 260);
}

yesButton.addEventListener("click", celebrate);

// ---------- Start ----------
startAmbientBackground();
