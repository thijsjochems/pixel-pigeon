const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const images = {};
let keys = {};

// Laad plaatjes (dummy voor nu)
function loadImage(name, src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      images[name] = img;
      resolve();
    };
  });
}

// Speler
const pigeon = {
  x: 100,
  y: 300,
  width: 64,
  height: 64,
  velocity: 0,
  gravity: 0.5,
  lift: -10,
  flapFrame: 0,
  flapInterval: 5
};

// Achtergrondlagen voor parallax
const bgLayers = [
  { x: 0, speed: 0.5, image: "bg_far" },
  { x: 0, speed: 1, image: "bg_near" }
];

// Controls
document.addEventListener("keydown", (e) => keys[e.code] = true);
document.addEventListener("keyup", (e) => keys[e.code] = false);

function update() {
  // Flap
  if (keys["Space"]) {
    pigeon.velocity = pigeon.lift;
  }

  pigeon.velocity += pigeon.gravity;
  pigeon.y += pigeon.velocity;

  if (pigeon.y > canvas.height - pigeon.height) {
    pigeon.y = canvas.height - pigeon.height;
    pigeon.velocity = 0;
  }

  if (pigeon.y < 0) {
    pigeon.y = 0;
    pigeon.velocity = 0;
  }

  // Achtergrond scroll
  bgLayers.forEach(layer => {
    layer.x -= layer.speed;
    if (layer.x <= -canvas.width) {
      layer.x = 0;
    }
  });

  // Flap animatie
  pigeon.flapFrame = (pigeon.flapFrame + 1) % (pigeon.flapInterval * 2);
}

function draw() {
  // Achtergrond lagen
  bgLayers.forEach(layer => {
    const img = images[layer.image];
    ctx.drawImage(img, layer.x, 0, canvas.width, canvas.height);
    ctx.drawImage(img, layer.x + canvas.width, 0, canvas.width, canvas.height);
  });

  // Duif tekenen (afwisselend frame als stijgt)
  const flapping = pigeon.velocity < 0;
  const frame = flapping && pigeon.flapFrame < pigeon.flapInterval ? images.pigeon_flap : images.pigeon;

  ctx.drawImage(frame, pigeon.x, pigeon.y, pigeon.width, pigeon.height);
}

function gameLoop() {
  update();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  draw();
  requestAnimationFrame(gameLoop);
}

// Start
Promise.all([
  loadImage("pigeon", "assets/pigeon_idle.png"),
  loadImage("pigeon_flap", "assets/pigeon_flap.png"),
  loadImage("bg_far", "assets/bg_skyline_far.png"),
  loadImage("bg_near", "assets/bg_skyline_near.png")
]).then(() => {
  gameLoop();
});
