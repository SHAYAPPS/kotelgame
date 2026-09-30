import * as THREE from 'three';
import './style.css';

// Minimal scene that proves the Vite + Three.js setup works.
// Replaced by the real game bootstrap in the first feature.
const container = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8d0);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(3, 2, 4);
camera.lookAt(0, 0.5, 0);

scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x5a5346, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(4, 8, 3);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x8d8a83 }),
);
scene.add(ground);

const box = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xc9b99a }),
);
box.position.y = 0.5;
scene.add(box);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop((time) => {
  box.rotation.y = time * 0.0005;
  renderer.render(scene, camera);
});
