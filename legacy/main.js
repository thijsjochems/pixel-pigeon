// === SETUP ===
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// CAMERA — orthographic (retro style)
const aspect = window.innerWidth / window.innerHeight;
const d = 10;
const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
camera.position.set(10, 15, 10);
camera.lookAt(0, 1, 0);

// LICHT — superhelder
scene.add(new THREE.AmbientLight(0xffffff, 2));
const hemi = new THREE.HemisphereLight(0xffffcc, 0x444466, 2);
scene.add(hemi);

// TEXTURES
const loader = new THREE.TextureLoader();
const textures = {
  ground: loader.load('textures/asphalt.png'),
  building: loader.load('textures/building.png'),
  pigeon: loader.load('textures/pigeon.png'),
  poop: loader.load('textures/poop.png'),
  car: loader.load('textures/car.png')
};
for (let key in textures) {
  textures[key].magFilter = THREE.NearestFilter;
}

// === GROND ===
const ground = new THREE.Mesh(
  new THREE.BoxGeometry(20, 1, 20),
  new THREE.MeshBasicMaterial({ map: textures.ground })
);
ground.position.y = -0.5;
scene.add(ground);

// === GEBOUWEN ===
function createBuilding(x, z, height) {
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(2, height, 2),
    new THREE.MeshBasicMaterial({ map: textures.building })
  );
  building.position.set(x, height / 2, z);
  scene.add(building);
}
createBuilding(-6, -6, 6);
createBuilding(4, -4, 4);
createBuilding(0, 6, 5);

// === DUIF ===
const pigeon = new THREE.Mesh(
  new THREE.BoxGeometry(1, 0.6, 1),
  new THREE.MeshBasicMaterial({ map: textures.pigeon })
);
pigeon.position.set(0, 1, 0);
scene.add(pigeon);

let velocity = 0;
const gravity = -0.02;
const lift = 0.5;

// === AUTO ===
const car = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 0.5, 0.8),
  new THREE.MeshBasicMaterial({ map: textures.car })
);
car.position.set(-10, 0.25, -4);
scene.add(car);

// === POEP ===
let poopGroup = new THREE.Group();
scene.add(poopGroup);
function dropPoop() {
  const poop = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshBasicMaterial({ map: textures.poop })
  );
  poop.position.copy(pigeon.position);
  poopGroup.add(poop);
}

// === ANIMATIE ===
function animate() {
  requestAnimationFrame(animate);

  // zwaartekracht
  velocity += gravity;
  pigeon.position.y += velocity;
  if (pigeon.position.y < 1) {
    pigeon.position.y = 1;
    velocity = 0;
  }

  // auto beweegt
  car.position.x += 0.05;
  if (car.position.x > 10) car.position.x = -10;

  // poep valt
  poopGroup.children.forEach((p) => {
    p.position.y -= 0.1;
    if (p.position.y < 0.3) p.visible = false;
  });

  // camera volgt duif
  camera.position.y = pigeon.position.y + 5;
  camera.lookAt(pigeon.position);

  renderer.render(scene, camera);
}
animate();

// === CONTROLS ===
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') velocity = lift;
  if (e.code === 'Enter') dropPoop();
});
