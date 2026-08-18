// 렌더러 · 조명 · 카메라 리그 · 포인터 레이캐스트.
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { clamp, lerp } from './utils.js';

export class SceneManager {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1220);
    this.scene.fog = new THREE.Fog(0x0d1220, 60, 130);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.5, 400);

    // 카메라 리그: 플레이어를 따라다니는 오빗 카메라
    this.target = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    this.yaw = Math.PI * 0.25;
    this.pitch = 0.92;
    this.distance = 24;

    this._setupLights();
    this._setupGround();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(0, 0);
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.pointerWorld = new THREE.Vector3();

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  _setupLights() {
    this.scene.add(new THREE.HemisphereLight(0x9ec6ff, 0x2a3348, 1.15));

    const sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
    sun.position.set(34, 46, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 60;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
    sun.shadow.bias = -0.0009;
    this.scene.add(sun);
    this.sun = sun;

    // 크리스탈에서 새어나오는 푸른 빛
    this.crystalLight = new THREE.PointLight(0x63e0ff, 2.2, 46, 2);
    this.crystalLight.position.set(0, 5, 0);
    this.scene.add(this.crystalLight);
  }

  _setupGround() {
    const size = CFG.world.size;
    const g = new THREE.PlaneGeometry(size, size, 1, 1);
    const m = new THREE.MeshStandardMaterial({ color: 0x3c5540, roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(g, m);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    // 맵 경계 밖은 어두운 황무지 느낌
    const outer = new THREE.Mesh(
      new THREE.RingGeometry(size * 0.62, size * 1.4, 48),
      new THREE.MeshBasicMaterial({ color: 0x151b28, side: THREE.DoubleSide })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    this.scene.add(outer);

    // 건설 가능 구역 표시
    const zone = new THREE.Mesh(
      new THREE.RingGeometry(CFG.world.buildRadius - 0.22, CFG.world.buildRadius, 96),
      new THREE.MeshBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0.55 })
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.03;
    this.scene.add(zone);
    this.buildZoneRing = zone;

    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(CFG.world.buildRadius, 96),
      new THREE.MeshBasicMaterial({ color: 0x2b6d7a, transparent: true, opacity: 0.14 })
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.015;
    this.scene.add(inner);

    // 건설 모드에서만 켜지는 그리드
    const grid = new THREE.GridHelper(CFG.world.buildRadius * 2, (CFG.world.buildRadius * 2) / CFG.world.cell, 0x66e0ff, 0x2c5a68);
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    grid.position.y = 0.04;
    grid.visible = false;
    this.scene.add(grid);
    this.grid = grid;
  }

  setBuildGridVisible(v) { this.grid.visible = v; }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  rotate(dx, dy) {
    this.yaw -= dx * 0.0045;
    this.pitch = clamp(this.pitch + dy * 0.003, 0.42, 1.32);
  }
  zoom(delta) {
    this.distance = clamp(this.distance + delta * 0.02, 12, 46);
  }

  // 플레이어 위치를 따라 부드럽게 이동
  follow(pos, dt) {
    this.target.set(pos.x, 0, pos.z);
    const k = 1 - Math.pow(0.001, dt);
    this.focus.lerp(this.target, k);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * cp * this.distance,
      this.focus.y + sp * this.distance,
      this.focus.z + Math.cos(this.yaw) * cp * this.distance
    );
    this.camera.lookAt(this.focus.x, this.focus.y + 1.4, this.focus.z);
  }

  setPointer(clientX, clientY) {
    this.pointer.x = (clientX / innerWidth) * 2 - 1;
    this.pointer.y = -(clientY / innerHeight) * 2 + 1;
  }

  // 화면 포인터가 가리키는 바닥 좌표
  updatePointerWorld() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this._groundPlane, this.pointerWorld);
    return hit ? this.pointerWorld : null;
  }

  // 카메라 기준 이동 방향(월드 XZ)
  moveBasis() {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return { fx: -s, fz: -c, rx: c, rz: -s };
  }

  render() { this.renderer.render(this.scene, this.camera); }

  worldToScreenXYZ(x, y, z) {
    return this.worldToScreen(new THREE.Vector3(x, y, z));
  }

  worldToScreen(v3) {
    const p = v3.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, visible: p.z < 1 };
  }
}

// 부드러운 값 추적용
export const approach = (cur, goal, dt, speed) => lerp(cur, goal, 1 - Math.exp(-speed * dt));
