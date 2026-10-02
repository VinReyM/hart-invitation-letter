// ---------- Elements ----------
const effectsLayer = document.getElementById("effects");
const stage = document.querySelector(".stage");
const card = document.getElementById("card");
const message = document.getElementById("message");
const subMessage = document.getElementById("subMessage");
const buttonRow = document.getElementById("buttons");
const yesButton = document.getElementById("yesButton");
const noButton = document.getElementById("noButton");

// ---------- Settings ----------
const COLORS = ["#ff7a9c", "#f03e5f", "#ffb3c6", "#c9184a", "#ffffff"];
const NO_MESSAGES = ["No", "Nice try!", "Too slow!", "Catch me!", "Nope!", "Try again!"];
const SAFE_PADDING = 24;         // the No button never goes closer than this to any screen edge
const DODGE_DISTANCE = 70;       // how close the pointer can get before the button runs away
const DODGE_COOLDOWN_MS = 120;   // stops it from jittering while mid-flight
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let isCelebrating = false;
let hasStartedDodging = false;
let lastDodgeTime = 0;
// Where the No button is (or is heading), in stage coordinates
let noTarget = { x: 0, y: 0, width: 0, height: 0 };

const random = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

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

// ---------- No button: safe zone ----------
// The allowed area for the button's top-left corner, in stage coordinates
function getSafeZone() {
  const width = noButton.offsetWidth;
  const height = noButton.offsetHeight;
  const minX = SAFE_PADDING;
  const minY = SAFE_PADDING;
  const maxX = Math.max(minX, stage.clientWidth - width - SAFE_PADDING);
  const maxY = Math.max(minY, stage.clientHeight - height - SAFE_PADDING);
  return { minX, minY, maxX, maxY, width, height };
}

function placeNoButton(x, y) {
  const zone = getSafeZone();
  const safeX = clamp(Number.isFinite(x) ? x : zone.minX, zone.minX, zone.maxX);
  const safeY = clamp(Number.isFinite(y) ? y : zone.minY, zone.minY, zone.maxY);
  noButton.style.left = `${safeX}px`;
  noButton.style.top = `${safeY}px`;
  noTarget = { x: safeX, y: safeY, width: zone.width, height: zone.height };
}

// Move the button out of the card and into the stage so its coordinates match the screen.
// A spacer keeps the Yes button from shifting.
function makeNoButtonFloating() {
  const rect = noButton.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();

  const placeholder = document.createElement("span");
  placeholder.style.width = `${rect.width}px`;
  placeholder.style.height = `${rect.height}px`;
  buttonRow.insertBefore(placeholder, noButton);

  stage.appendChild(noButton);
  noButton.classList.add("is-floating");
  // Start exactly where it was, with no transition, so the first dodge animates from there
  noButton.style.transition = "none";
  placeNoButton(rect.left - stageRect.left, rect.top - stageRect.top);
  noButton.getBoundingClientRect();
  noButton.style.transition = "";

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

// Pick a spot inside the safe zone, away from the pointer and the Yes button
function pickNewPosition(pointerX, pointerY) {
  const zone = getSafeZone();
  const stageRect = stage.getBoundingClientRect();
  const yesRect = yesButton.getBoundingClientRect();
  const yesBox = {
    x: yesRect.left - stageRect.left,
    y: yesRect.top - stageRect.top,
    width: yesRect.width,
    height: yesRect.height,
  };
  const pointerInStageX = pointerX - stageRect.left;
  const pointerInStageY = pointerY - stageRect.top;
  const minPointerDistance = Math.min(200, stage.clientWidth / 3, stage.clientHeight / 3);

  let bestCandidate = null;
  let bestDistance = -1;

  for (let attempt = 0; attempt < 30; attempt++) {
    const x = random(zone.minX, zone.maxX);
    const y = random(zone.minY, zone.maxY);
    const distance = Math.hypot(x + zone.width / 2 - pointerInStageX, y + zone.height / 2 - pointerInStageY);
    const overlapsYes = rectsOverlap({ x, y, width: zone.width, height: zone.height }, yesBox, 16);

    if (!overlapsYes && (Number.isNaN(distance) || distance > bestDistance)) {
      bestDistance = Number.isNaN(distance) ? 0 : distance;
      bestCandidate = { x, y };
    }
    if (!overlapsYes && distance >= minPointerDistance) break;
  }

  return bestCandidate || { x: random(zone.minX, zone.maxX), y: random(zone.minY, zone.maxY) };
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
    noButton.textContent = pick(options);
  }

  const { x, y } = pickNewPosition(pointerX, pointerY);
  placeNoButton(x, y);

  // Restart the wiggle animation with a random tilt
  noButton.style.setProperty("--tilt", `${random(10, 22)}deg`);
  noButton.classList.remove("is-dodging");
  void noButton.offsetWidth;
  noButton.classList.add("is-dodging");
}

function distanceToNoButton(pointerX, pointerY) {
  let box;
  if (!hasStartedDodging) {
    const rect = noButton.getBoundingClientRect();
    box = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  } else {
    const stageRect = stage.getBoundingClientRect();
    box = { x: noTarget.x + stageRect.left, y: noTarget.y + stageRect.top, width: noTarget.width, height: noTarget.height };
  }
  const dx = Math.max(box.x - pointerX, 0, pointerX - (box.x + box.width));
  const dy = Math.max(box.y - pointerY, 0, pointerY - (box.y + box.height));
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

// Watchdog: if the button is ever outside the safe zone (resize, rotation, glitch), snap it back
function keepNoButtonInside() {
  if (!hasStartedDodging || isCelebrating) return;
  noButton.hidden = false;
  noButton.style.visibility = "visible";
  noButton.style.opacity = "1";

  const stageRect = stage.getBoundingClientRect();
  const rect = noButton.getBoundingClientRect();
  const zone = getSafeZone();
  const tolerance = 2;
  const isOutside =
    rect.left - stageRect.left < zone.minX - tolerance ||
    rect.top - stageRect.top < zone.minY - tolerance ||
    rect.left - stageRect.left > zone.maxX + tolerance ||
    rect.top - stageRect.top > zone.maxY + tolerance;

  // Only correct once the move animation has settled, otherwise a mid-flight check would fight it
  if (isOutside && Math.abs(rect.left - stageRect.left - noTarget.x) < 1 && Math.abs(rect.top - stageRect.top - noTarget.y) < 1) {
    placeNoButton(noTarget.x, noTarget.y);
  } else if (rect.left - stageRect.left < -rect.width || rect.top - stageRect.top < -rect.height ||
             rect.left - stageRect.left > stage.clientWidth || rect.top - stageRect.top > stage.clientHeight) {
    placeNoButton(random(zone.minX, zone.maxX), random(zone.minY, zone.maxY));
  } else {
    placeNoButton(noTarget.x, noTarget.y);
  }
}
window.addEventListener("resize", keepNoButtonInside);
window.addEventListener("orientationchange", keepNoButtonInside);
setInterval(keepNoButtonInside, 500);

// ---------- Stickers and memes (shown after Yes) ----------
const stickerLayer = document.createElement("div");
stickerLayer.className = "sticker-layer";
stickerLayer.setAttribute("aria-hidden", "true");
document.body.appendChild(stickerLayer);

const HEART_PATH = "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.4 4.5c2.1 0 3.9 1.1 5.6 3.2 1.7-2.1 3.5-3.2 5.6-3.2 3.7 0 5.5 3.9 4 7.3C19.5 16.4 12 21 12 21z";
const INK = "#c9184a";

// Small SVG building blocks, so every sticker is drawn in code (no image files, no emoji)
const svg = (inner) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const heart = (x, y, scale, fill = "#f03e5f") =>
  `<path transform="translate(${x} ${y}) scale(${scale})" d="${HEART_PATH}" fill="${fill}" stroke="${INK}" stroke-width="${(2 / scale).toFixed(2)}" stroke-linejoin="round"/>`;
const line = (d, width = 4) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const faceBase = (fill) => `<circle cx="50" cy="52" r="42" fill="${fill}" stroke="${INK}" stroke-width="3.5"/>`;
const blush = `<ellipse cx="22" cy="62" rx="9" ry="5.5" fill="#ff7a9c" opacity=".55"/><ellipse cx="78" cy="62" rx="9" ry="5.5" fill="#ff7a9c" opacity=".55"/>`;
const openMouth = (d) => `<path d="${d}" fill="#f03e5f" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
const starEye = (x, y) =>
  `<polygon transform="translate(${x} ${y}) scale(.28)" points="0,-50 12,-12 50,0 12,12 0,50 -12,12 -50,0 -12,-12" fill="#f03e5f" stroke="${INK}" stroke-width="7"/>`;

const ART = {
  heartEyes: svg(faceBase("#ffe3ea") + blush + heart(16, 29, 1.2) + heart(56, 29, 1.2) + openMouth("M34 62 Q50 84 66 62 Z")),
  kawaii: svg(faceBase("#fff0f3") + blush + line("M26 48 Q33 38 40 48") + line("M60 48 Q67 38 74 48") + openMouth("M38 62 Q50 76 62 62 Z")),
  happyCry: svg(
    faceBase("#ffe3ea") + blush + line("M24 46 Q32 36 40 46") + line("M60 46 Q68 36 76 46") +
    `<path d="M30 52 Q24 64 30 70 Q36 64 30 52Z" fill="#8ecbff"/><path d="M70 52 Q64 64 70 70 Q76 64 70 52Z" fill="#8ecbff"/>` +
    openMouth("M32 62 Q50 90 68 62 Z")
  ),
  starry: svg(faceBase("#fff0f3") + blush + starEye(30, 44) + starEye(70, 44) + line("M36 64 Q50 78 64 64")),
  letter: svg(
    `<rect x="10" y="26" width="80" height="54" rx="8" fill="#fff" stroke="${INK}" stroke-width="3.5"/>` +
    `<path d="M12 30 L50 58 L88 30" fill="#ffe3ea" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>` +
    heart(38, 46, 1) + heart(68, 4, 0.8, "#ff7a9c") + heart(12, 8, 0.6, "#ff7a9c")
  ),
  cupid: svg(
    heart(8, 10, 3.6) + line("M16 84 L84 22", 4.5) + line("M72 22 L86 20 L84 34", 4.5) +
    line("M16 84 L8 82 M16 84 L18 92 M22 78 L14 76 M22 78 L24 86", 3.5)
  ),
  dancer: svg(
    line("M20 52 Q8 44 10 30") + line("M80 52 Q92 44 90 30") + line("M42 74 L38 92") + line("M58 74 L64 90") +
    heart(11.6, 8, 3.2) +
    `<circle cx="42" cy="44" r="3.2" fill="${INK}"/><circle cx="58" cy="44" r="3.2" fill="${INK}"/>` +
    `<ellipse cx="35" cy="52" rx="5" ry="3" fill="#ffb3c6"/><ellipse cx="65" cy="52" rx="5" ry="3" fill="#ffb3c6"/>` +
    line("M43 53 Q50 61 57 53", 3)
  ),
};

const BUBBLE_TEXTS = ["OMG!", "AWWW", "YESSS", "KYAA!", "SO CUTE", "BLUSHING", "LOVE IT", "SWOON"];
const MEME_CAPTIONS_A = [
  ["When they say yes", "Heart go brrr"],
  ["Me: stay calm", "My heart: no"],
  ["Nobody:", "Me: they said yes"],
  ["All systems", "Lovestruck"],
];
const MEME_CAPTIONS_B = [
  ["Plot twist", "It's a date"],
  ["My heart: calm down", "Also my heart: no"],
  ["We're so back", "And it's romantic"],
  ["Certified", "Love enjoyer"],
];

function createSticker(slotNumber, artName, enterDelay) {
  const sticker = document.createElement("div");
  sticker.className = `sticker s${slotNumber}${slotNumber % 2 === 0 ? " is-right" : ""}`;
  sticker.style.setProperty("--enter-delay", `${enterDelay}s`);
  sticker.style.setProperty("--tilt", `${random(-14, 14)}deg`);
  sticker.style.setProperty("--idle-speed", `${random(2.4, 4)}s`);
  sticker.style.setProperty("--bubble-delay", `${enterDelay + random(1, 4)}s`);
  sticker.innerHTML = `<span class="sticker-art">${ART[artName]}</span><span class="bubble"></span>`;

  const bubble = sticker.querySelector(".bubble");
  bubble.textContent = pick(BUBBLE_TEXTS);
  bubble.addEventListener("animationiteration", () => { bubble.textContent = pick(BUBBLE_TEXTS); });

  // Tapping a sticker makes it boing and burst into hearts
  sticker.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    sticker.classList.remove("boing");
    void sticker.offsetWidth;
    sticker.classList.add("boing");
    spawnBurst(event.clientX, event.clientY);
  });

  stickerLayer.appendChild(sticker);
}

// A classic top-text / bottom-text meme card whose face and caption swap every few seconds
function createMeme(className, faces, captions, enterDelay, tilt) {
  const meme = document.createElement("div");
  meme.className = `meme ${className}`;
  meme.style.setProperty("--enter-delay", `${enterDelay}s`);
  meme.style.setProperty("--tilt", `${tilt}deg`);
  meme.innerHTML = `<div class="meme-inner"><span class="meme-text meme-top"></span><span class="meme-face"></span><span class="meme-text meme-bottom"></span></div>`;

  const inner = meme.querySelector(".meme-inner");
  const topText = meme.querySelector(".meme-top");
  const bottomText = meme.querySelector(".meme-bottom");
  const face = meme.querySelector(".meme-face");
  let frame = 0;

  const showFrame = () => {
    face.innerHTML = ART[faces[frame % faces.length]];
    [topText.textContent, bottomText.textContent] = captions[frame % captions.length];
  };
  showFrame();

  setInterval(() => {
    if (document.hidden) return;
    inner.classList.remove("is-swapping");
    void inner.offsetWidth;
    inner.classList.add("is-swapping");
    setTimeout(() => { frame++; showFrame(); }, 180); // swap at the squish
  }, 3400);

  stickerLayer.appendChild(meme);
}

// Ring of little hearts that pops out wherever the screen is tapped
function spawnBurst(x, y) {
  const pieceCount = 10;
  for (let i = 0; i < pieceCount; i++) {
    const angle = (Math.PI * 2 * i) / pieceCount + random(-0.2, 0.2);
    const distance = random(50, 120);
    const size = random(12, 24);
    const piece = document.createElement("span");
    piece.className = "heart burst-piece";
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    piece.style.color = COLORS[Math.floor(random(0, 4))];
    piece.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    piece.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    piece.style.setProperty("--spin", `${random(-90, 90)}deg`);
    stickerLayer.appendChild(piece);
    piece.addEventListener("animationend", () => piece.remove(), { once: true });
  }
}

function showStickersAndMemes() {
  const lineup = ["heartEyes", "dancer", "letter", "cupid", "starry", "kawaii"];
  lineup.forEach((artName, index) => createSticker(index + 1, artName, 0.3 + index * 0.22));

  createMeme("meme-a", ["heartEyes", "kawaii", "starry"], MEME_CAPTIONS_A, 1.1, -7);
  createMeme("meme-b", ["happyCry", "dancer", "heartEyes"], MEME_CAPTIONS_B, 1.5, 6);

  document.addEventListener("pointerdown", (event) => spawnBurst(event.clientX, event.clientY));
}

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
  showStickersAndMemes();

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
