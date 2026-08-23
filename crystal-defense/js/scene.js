import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { clamp } from './utils.js';

export var SceneManager = class {
  constructor(canvas2) {
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas2, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(856608);
    this.scene.fog = new THREE.Fog(856608, 60, 130);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.5, 400);
    this.target = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    this.yaw = Math.PI * 0.25;
    this.pitch = 0.92;
    this.distance = 24;
    this.wantDistance = 24;
    this.buildView = false;
    this._buildBoost = 0;
    this._setupLights();
    this._setupGround();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(0, 0);
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.pointerWorld = new THREE.Vector3();
    addEventListener("resize", () => this.resize());
    this.resize();
  }
  _setupLights() {
    const hemi = new THREE.HemisphereLight(10405631, 2765640, 1.15);
    this.scene.add(hemi);
    this.hemi = hemi;
    const sun = new THREE.DirectionalLight(16773848, 2);
    sun.position.set(34, 46, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s2 = 60;
    sun.shadow.camera.left = -s2;
    sun.shadow.camera.right = s2;
    sun.shadow.camera.top = s2;
    sun.shadow.camera.bottom = -s2;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 160;
    sun.shadow.bias = -9e-4;
    this.scene.add(sun);
    this.sun = sun;
    this.crystalLight = new THREE.PointLight(6545663, 2.2, 46, 2);
    this.crystalLight.position.set(0, 5, 0);
    this.scene.add(this.crystalLight);
    this._day = { bg: 856608, fogNear: 60, fogFar: 130, hemi: 1.15, sun: 2, crystalI: 2.2, crystalR: 46 };
    this._nightVal = { bg: 526344, fogNear: 22, fogFar: 58, hemi: 0.32, sun: 0.45, crystalI: 3.6, crystalR: 62 };
    this._nightC1 = new THREE.Color(this._day.bg);
    this._nightC2 = new THREE.Color(this._nightVal.bg);
    this._night = 0;
    this._nightTarget = 0;
    this.crystalNightMult = 1;
  }
  setNightMode(active) {
    this._nightTarget = active ? 1 : 0;
  }
  // 새 판을 시작할 때 이전 판이 밤 웨이브 중이었어도 즉시 낮으로 되돌린다.
  // updateNight() 는 _night === _nightTarget 이면 아무 것도 다시 계산하지 않고 즉시 반환하므로,
  // 강제로 어긋나게 만든 뒤 큰 dt 로 한 번 밟아서 낮 값을 실제로 다시 적용시킨다.
  resetNight() {
    this._nightTarget = 0;
    this._night = 1;
    this.updateNight(10);
  }
  updateNight(dt2) {
    if (this._night === this._nightTarget) return;
    this._night += (this._nightTarget - this._night) * Math.min(1, dt2 * 1.1);
    if (Math.abs(this._night - this._nightTarget) < 1e-3) this._night = this._nightTarget;
    const t2 = this._night;
    const d2 = this._day, n2 = this._nightVal;
    const bg = this._nightC1.copy(this._nightC1.set(d2.bg)).lerp(this._nightC2.set(n2.bg), t2);
    this.scene.background.copy(bg);
    this.scene.fog.color.copy(bg);
    this.scene.fog.near = d2.fogNear + (n2.fogNear - d2.fogNear) * t2;
    this.scene.fog.far = d2.fogFar + (n2.fogFar - d2.fogFar) * t2;
    this.hemi.intensity = d2.hemi + (n2.hemi - d2.hemi) * t2;
    this.sun.intensity = d2.sun + (n2.sun - d2.sun) * t2;
    const crystalI = d2.crystalI + (n2.crystalI - d2.crystalI) * t2;
    this.crystalNightMult = crystalI / d2.crystalI;
    this.crystalLight.distance = d2.crystalR + (n2.crystalR - d2.crystalR) * t2;
  }
  _setupGround() {
    const size = CFG.world.size;
    const g2 = new THREE.PlaneGeometry(size, size, 1, 1);
    const m2 = new THREE.MeshStandardMaterial({ color: 3953984, roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(g2, m2);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
    const outer = new THREE.Mesh(
      new THREE.RingGeometry(size * 0.62, size * 1.4, 48),
      new THREE.MeshBasicMaterial({ color: 1383208, side: THREE.DoubleSide })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    this.scene.add(outer);
    const zone = new THREE.Mesh(
      new THREE.RingGeometry(CFG.world.buildRadius - 0.22, CFG.world.buildRadius, 96),
      new THREE.MeshBasicMaterial({ color: 6280447, transparent: true, opacity: 0.55 })
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.03;
    this.scene.add(zone);
    this.buildZoneRing = zone;
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(CFG.world.buildRadius, 96),
      new THREE.MeshBasicMaterial({ color: 2846074, transparent: true, opacity: 0.14 })
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.015;
    this.scene.add(inner);
    const grid = new THREE.GridHelper(CFG.world.buildRadius * 2, CFG.world.buildRadius * 2 / CFG.world.cell, 6742271, 2906728);
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    grid.position.y = 0.04;
    grid.visible = false;
    this.scene.add(grid);
    this.grid = grid;
  }
  setBuildGridVisible(v2) {
    this.grid.visible = v2;
  }
  resize() {
    const w2 = innerWidth, h2 = innerHeight;
    this.renderer.setSize(w2, h2, false);
    this.camera.aspect = w2 / h2;
    this.camera.updateProjectionMatrix();
  }
  rotate(dx, dy) {
    this.yaw -= dx * 45e-4;
    this.pitch = clamp(this.pitch + dy * 3e-3, 0.42, 1.32);
  }
  // 휠 한 칸이 현재 거리에 비례해 움직이므로, 가까이서도 멀리서도 같은 감각으로 확대/축소된다.
  zoom(delta) {
    const step = Math.exp(clamp(delta, -240, 240) * 9e-4);
    this.wantDistance = clamp(this.wantDistance * step, 9, 60);
  }
  // 건설 모드에서는 카메라를 살짝 물러나 위에서 내려다보게 해 시야를 넓힌다
  setBuildView(active) {
    this.buildView = active;
  }
  // 플레이어 위치를 따라 부드럽게 이동
  follow(pos, dt2) {
    this.target.set(pos.x, 0, pos.z);
    const k2 = 1 - Math.pow(1e-3, dt2);
    this.focus.lerp(this.target, k2);
    this.distance += (this.wantDistance - this.distance) * Math.min(1, dt2 * 9);
    const boostTarget = this.buildView ? 1 : 0;
    this._buildBoost += (boostTarget - this._buildBoost) * Math.min(1, dt2 * 3);
    const dist3 = this.distance + this._buildBoost * 12;
    const pitch = clamp(this.pitch + this._buildBoost * 0.2, 0.42, 1.32);
    const cp2 = Math.cos(pitch), sp2 = Math.sin(pitch);
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * cp2 * dist3,
      this.focus.y + sp2 * dist3,
      this.focus.z + Math.cos(this.yaw) * cp2 * dist3
    );
    this.camera.lookAt(this.focus.x, this.focus.y + 1.4, this.focus.z);
  }
  setPointer(clientX, clientY) {
    this.pointer.x = clientX / innerWidth * 2 - 1;
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
    const s2 = Math.sin(this.yaw), c2 = Math.cos(this.yaw);
    return { fx: -s2, fz: -c2, rx: c2, rz: -s2 };
  }
  render() {
    this.renderer.render(this.scene, this.camera);
  }
  worldToScreenXYZ(x2, y2, z2) {
    return this.worldToScreen(new THREE.Vector3(x2, y2, z2));
  }
  worldToScreen(v3) {
    const p2 = v3.clone().project(this.camera);
    return { x: (p2.x * 0.5 + 0.5) * innerWidth, y: (-p2.y * 0.5 + 0.5) * innerHeight, visible: p2.z < 1 };
  }
};
