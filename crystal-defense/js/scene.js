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
    // 해를 조금 더 낮고 따뜻하게 — 그림자가 길어져 건물·지형의 입체가 살고, 차가운 hemisphere
    // 와 색이 갈려서 같은 초록 바닥도 양지/음지가 구분된다(전에는 위에서 거의 수직으로 때려
    // 그림자가 발밑에만 눌려 있었다)
    const sun = new THREE.DirectionalLight(16770740, 2.35);
    sun.position.set(40, 38, 26);
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
    // 해 반대쪽에서 약하게 받쳐 주는 차가운 보조광 — 그림자 쪽이 새카맣게 죽지 않고 실루엣의
    // 윤곽이 남는다. 그림자를 만들지 않으므로(castShadow 없음) 비용이 거의 없다.
    const rim = new THREE.DirectionalLight(8365272, 0.55);
    rim.position.set(-30, 18, -24);
    this.scene.add(rim);
    this.rimLight = rim;
    this._day = { bg: 856608, fogNear: 60, fogFar: 130, hemi: 1.15, sun: 2.35, rim: 0.55, crystalI: 2.2, crystalR: 46 };
    this._nightVal = { bg: 526344, fogNear: 22, fogFar: 58, hemi: 0.32, sun: 0.45, rim: 0.16, crystalI: 3.6, crystalR: 62 };
    this._nightC1 = new THREE.Color(this._day.bg);
    this._nightC2 = new THREE.Color(this._nightVal.bg);
    this._night = 0;
    this._nightTarget = 0;
    this.crystalNightMult = 1;
    this._weatherVal = {
      rain: { fogNear: 46, fogFar: 100, tint: 5928568 },
      fog: { fogNear: 22, fogFar: 52, tint: 13291480 },
      storm: { fogNear: 42, fogFar: 95, tint: 3028042 },
      hail: { fogNear: 40, fogFar: 92, tint: 12113128 },
      clear: { fogNear: 70, fogFar: 150, tint: 16772822 }
    };
    this._weatherC1 = new THREE.Color();
    this._weatherC2 = new THREE.Color();
    this._weather = 0;
    this._weatherTarget = 0;
    this._weatherKind = null;
  }
  setNightMode(active) {
    this._nightTarget = active ? 1 : 0;
  }
  // kind: "rain" | "fog" | "storm" | "hail" | "clear" | null. null 이면 서서히 걷힌다(마지막 종류는 페이드아웃 동안 기억해 둔다).
  setWeather(kind) {
    if (kind) this._weatherKind = kind;
    this._weatherTarget = kind ? 1 : 0;
  }
  resetWeather() {
    this._weatherTarget = 0;
    this._weather = 1;
    this.updateWeather(10);
  }
  updateWeather(dt2) {
    if (this._weather === this._weatherTarget) return;
    this._weather += (this._weatherTarget - this._weather) * Math.min(1, dt2 * 1.1);
    if (Math.abs(this._weather - this._weatherTarget) < 1e-3) this._weather = this._weatherTarget;
    const t2 = this._weather;
    const d2 = this._day, w2 = this._weatherVal[this._weatherKind || "rain"];
    const bg = this._weatherC1.copy(this._weatherC1.set(d2.bg)).lerp(this._weatherC2.set(w2.tint), t2);
    this.scene.background.copy(bg);
    this.scene.fog.color.copy(bg);
    this.scene.fog.near = d2.fogNear + (w2.fogNear - d2.fogNear) * t2;
    this.scene.fog.far = d2.fogFar + (w2.fogFar - d2.fogFar) * t2;
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
    if (this.rimLight) this.rimLight.intensity = d2.rim + (n2.rim - d2.rim) * t2;
    const crystalI = d2.crystalI + (n2.crystalI - d2.crystalI) * t2;
    this.crystalNightMult = crystalI / d2.crystalI;
    this.crystalLight.distance = d2.crystalR + (n2.crystalR - d2.crystalR) * t2;
  }
  // 지형(biome)마다 바닥 색을 다시 칠한다 — 씬은 페이지 로드당 한 번만 만들어지고 여러 판을
  // 이어서 시작하므로(begin() 재호출), 화산지대 색이 다음 판에도 남아있지 않도록 매판 새로 부른다.
  setGroundTint(color) {
    const hex = color ?? this.groundDefaultColor;
    this.ground.material.color.setHex(hex);
    // 지면 장식도 같이 물들인다 — 안 그러면 설원·화산지대에 초록 풀포기가 그대로 남아
    // 지형색만 바뀐 것이 더 어색해진다. 원래 색을 기억해 두고 매번 그 색에서 다시 섞는다.
    if (this._clutter) {
      const t2 = this._clutterTint.setHex(hex);
      for (const c2 of this._clutter) c2.mat.color.copy(c2.base).lerp(t2, c2.mix);
    }
  }
  _setupGround() {
    const size = CFG.world.size;
    this.groundDefaultColor = 3953984;
    // 바닥을 잘게 나누고 정점마다 밝기·색조를 살짝 흔든다. 단색 판 하나였을 때는 어디를 봐도
    // 같은 색이라 거리감·기복이 전혀 안 읽혔는데, 정점 색만 흔들어도 지면이 "땅"처럼 보인다.
    // 정점 색은 재질 색과 곱해지므로 흰색(1.0) 기준으로 흔들어야 `setGroundTint()`의 지형별
    // 바닥색(설원·화산지대·늪지대)이 그대로 살아난다.
    const SEG = 64;
    const g2 = new THREE.PlaneGeometry(size, size, SEG, SEG);
    const pos = g2.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x2 = pos.getX(i), y2 = pos.getY(i);
      // 서로 다른 주기의 사인파를 겹쳐 규칙성이 눈에 안 띄는 얼룩을 만든다
      const n = Math.sin(x2 * 0.09) * Math.cos(y2 * 0.11) * 0.5 + Math.sin((x2 + y2) * 0.05) * 0.3 + Math.sin(x2 * 0.31 + y2 * 0.27) * 0.2;
      const v2 = 1 + n * 0.11;
      const warm = n * 0.05;
      colors[i * 3] = v2 + warm;
      colors[i * 3 + 1] = v2;
      colors[i * 3 + 2] = v2 - warm;
    }
    g2.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const m2 = new THREE.MeshStandardMaterial({ color: this.groundDefaultColor, vertexColors: true, roughness: 1, metalness: 0 });
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
    this._setupClutter();
  }
  // 지면에 풀포기·자갈·들꽃을 흩뿌린다. 자원 노드(나무/바위)만 있던 바닥이 텅 빈 종이처럼
  // 보였는데, 작은 물체가 깔리면 거리감과 스케일이 단번에 읽힌다. 셋 다 InstancedMesh 한
  // 개씩이라 드로우콜은 3개뿐이고, 충돌·상호작용은 전혀 없다.
  _setupClutter() {
    const size = CFG.world.size;
    // 크리스털 단상 바깥부터 맵 끝까지 — 건설 구역 안에도 깔아야 한다. 시야에 들어오는 건
    // 대부분 기지 안쪽이라, 바깥에만 뿌리면 화면에는 여전히 빈 바닥만 남는다.
    const inner = 5;
    const outer = size * 0.6;
    // 시드 고정 난수 — 매 판 같은 배치가 나와서 지형이 "그 맵"으로 기억된다
    let seed = 20260906;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 2147483647;
      return seed / 2147483647;
    };
    this._clutter = [];
    this._clutterTint = new THREE.Color();
    const spread = (count, geo, mat, mix, place) => {
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const m4 = new THREE.Matrix4(), q2 = new THREE.Quaternion(), e2 = new THREE.Euler();
      const pos = new THREE.Vector3(), scl = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        const a2 = rnd() * Math.PI * 2;
        // sqrt 로 반지름을 뽑아야 면적당 밀도가 균일해진다(그냥 rnd()면 안쪽에 뭉친다)
        const r2 = Math.sqrt(inner * inner + rnd() * (outer * outer - inner * inner));
        place(pos, scl, e2, r2 * Math.cos(a2), r2 * Math.sin(a2), rnd);
        q2.setFromEuler(e2);
        m4.compose(pos, q2, scl);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
      this._clutter.push({ mat, base: mat.color.clone(), mix });
      return mesh;
    };
    // 풀포기: 얇은 4각뿔 — 멀리서는 어차피 실루엣만 보인다
    spread(1400, new THREE.ConeGeometry(0.16, 0.6, 4), new THREE.MeshStandardMaterial({ color: 4881466, roughness: 1 }), 0.55,
      (pos, scl, e2, x2, z2, rnd) => {
        pos.set(x2, 0.28, z2);
        const s2 = 0.7 + rnd() * 0.9;
        scl.set(s2, s2 * (0.8 + rnd() * 0.7), s2);
        e2.set(0, rnd() * Math.PI, (rnd() - 0.5) * 0.24);
      });
    // 자갈은 일부러 작고 어둡게 — 조금만 키워도 캘 수 있는 바위 노드와 헷갈려서, 플레이어가
    // 곡괭이를 들고 장식물을 찍으러 가는 일이 생긴다
    spread(260, new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 6187106, roughness: 1 }), 0.35,
      (pos, scl, e2, x2, z2, rnd) => {
        pos.set(x2, 0.04 + rnd() * 0.03, z2);
        const s2 = 0.35 + rnd() * 0.35;
        scl.set(s2, s2 * 0.42, s2 * (0.8 + rnd() * 0.4));
        e2.set(rnd() * 0.4, rnd() * Math.PI * 2, rnd() * 0.4);
      });
    // 들꽃: 아주 작은 채도 높은 점. 한 가지 색 일색인 화면에 보색이 조금 섞이면 눈이 덜 지친다
    spread(320, new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: 15254634, roughness: 0.8, emissive: 3811840, emissiveIntensity: 0.3 }), 0.25,
      (pos, scl, e2, x2, z2, rnd) => {
        pos.set(x2, 0.34, z2);
        const s2 = 0.7 + rnd() * 0.7;
        scl.set(s2, s2, s2);
        e2.set(0, rnd() * Math.PI, 0);
      });
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
