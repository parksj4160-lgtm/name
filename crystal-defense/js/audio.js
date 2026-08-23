var MUTE_KEY = "cd.muted";
var VOL_KEY = "cd.volume";
var DEFAULT_VOL = 0.55;
var MUSIC_VOL_KEY = "cd.music.volume";
var DEFAULT_MUSIC_VOL = 0.32;
var ROOTS = [110, 87.31, 130.81, 98];
var SEMI = Math.pow(2, 1 / 12);
var MUSIC_PHASES = {
  prep: {
    bpm: 74,
    roots: ROOTS,
    bassWave: "triangle",
    bassPeak: 0.1,
    bassDur: 0.5,
    pad: true,
    padPeak: 0.045,
    padDur: 3.2,
    arp: false,
    kick: false
  },
  combat: {
    bpm: 122,
    roots: ROOTS,
    bassWave: "triangle",
    bassPeak: 0.12,
    bassDur: 0.32,
    pad: false,
    arp: true,
    arpSteps: 2,
    arpWave: "square",
    arpPeak: 0.045,
    arpDur: 0.15,
    arpPattern: [1, 1.5, 2, 1.5],
    dissonant: false,
    kick: false
  },
  boss: {
    bpm: 136,
    roots: ROOTS,
    bassWave: "sawtooth",
    bassPeak: 0.16,
    bassDur: 0.28,
    pad: false,
    arp: true,
    arpSteps: 2,
    arpWave: "sawtooth",
    arpPeak: 0.055,
    arpDur: 0.13,
    arpPattern: [2, 3, 4, 3],
    dissonant: true,
    dissonantMult: 3 * SEMI,
    kick: true,
    kickPeak: 0.22
  }
};
var MUSIC_LOOKAHEAD = 0.6;
var MUSIC_TICK_MS = 150;
var MusicDirector = class {
  constructor(sfx) {
    this.sfx = sfx;
    this.gain = null;
    const saved = parseFloat(localStorage.getItem(MUSIC_VOL_KEY));
    this.volume = Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : DEFAULT_MUSIC_VOL;
    this.phase = null;
    this._desired = null;
    this.running = false;
    this._pendingStart = false;
    this.nextTime = 0;
    this.beatIndex = 0;
    this._timer = null;
  }
  _effVol() {
    return this.sfx.muted ? 0 : this.volume;
  }
  _ensure() {
    const ctx = this.sfx._ensureCtx();
    if (!ctx) return null;
    if (!this.gain) {
      this.gain = ctx.createGain();
      this.gain.gain.value = this._effVol();
      this.gain.connect(ctx.destination);
    }
    return ctx;
  }
  setVolume(v2) {
    this.volume = Math.min(1, Math.max(0, v2));
    localStorage.setItem(MUSIC_VOL_KEY, String(this.volume));
    const ctx = this.sfx.ctx;
    if (this.gain && ctx) this.gain.gain.setTargetAtTime(this._effVol(), ctx.currentTime, 0.05);
  }
  applyMute() {
    const ctx = this.sfx.ctx;
    if (this.gain && ctx) this.gain.gain.setTargetAtTime(this._effVol(), ctx.currentTime, 0.05);
  }
  setPhase(phase) {
    if (!MUSIC_PHASES[phase]) return;
    this._desired = phase;
  }
  // ctx 가 아직 없으면(사용자 입력 전) 대기했다가 언락되는 순간 이어서 시작한다
  onUnlock() {
    if (this._pendingStart) {
      this._pendingStart = false;
      this.start(this._desired || "prep");
    }
  }
  start(phase) {
    this.setPhase(phase);
    if (this.running) return;
    const ctx = this._ensure();
    if (!ctx) {
      this._pendingStart = true;
      return;
    }
    this.running = true;
    this.phase = this._desired;
    this.beatIndex = 0;
    this.nextTime = ctx.currentTime + 0.15;
    this._loop();
  }
  stop() {
    this.running = false;
    this._pendingStart = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    const ctx = this.sfx.ctx;
    if (this.gain && ctx) this.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  }
  _loop() {
    if (!this.running) return;
    const ctx = this.sfx.ctx;
    if (ctx) {
      while (this.nextTime < ctx.currentTime + MUSIC_LOOKAHEAD) {
        this._scheduleBeat(this.nextTime);
        const def = MUSIC_PHASES[this.phase];
        this.nextTime += 60 / def.bpm;
        this.beatIndex++;
        if (this.beatIndex % 4 === 0 && this._desired && this._desired !== this.phase) {
          this.phase = this._desired;
        }
      }
    }
    this._timer = setTimeout(() => this._loop(), MUSIC_TICK_MS);
  }
  _scheduleBeat(t2) {
    const def = MUSIC_PHASES[this.phase];
    const bar = Math.floor(this.beatIndex / 4) % def.roots.length;
    const beatInBar = this.beatIndex % 4;
    const root = def.roots[bar];
    this._pluck(root * 0.5, t2, def);
    if (def.pad && beatInBar === 0) this._pad(root, t2, def);
    if (def.kick && (beatInBar === 0 || beatInBar === 2)) this._kick(t2, def);
    if (def.arp) {
      const n = def.arpSteps;
      const beatDur = 60 / def.bpm;
      for (let i = 0; i < n; i++) {
        const st = t2 + i * beatDur / n;
        const idx = (beatInBar * n + i) % def.arpPattern.length;
        let mult = def.arpPattern[idx];
        if (def.dissonant && bar % 2 === 1 && idx === def.arpPattern.length - 1) mult = def.dissonantMult;
        this._blip(root * mult, st, def);
      }
    }
  }
  _pluck(freq, t2, def) {
    const ctx = this.sfx.ctx;
    const osc = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc.type = def.bassWave;
    osc.frequency.setValueAtTime(freq, t2);
    g2.gain.setValueAtTime(1e-4, t2);
    g2.gain.exponentialRampToValueAtTime(def.bassPeak, t2 + 0.02);
    g2.gain.exponentialRampToValueAtTime(1e-4, t2 + def.bassDur);
    osc.connect(g2).connect(this.gain);
    osc.start(t2);
    osc.stop(t2 + def.bassDur + 0.05);
  }
  _pad(root, t2, def) {
    const ctx = this.sfx.ctx;
    for (const mult of [1, 1.5, 2]) {
      const osc = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(root * mult, t2);
      const peak = def.padPeak / mult;
      g2.gain.setValueAtTime(1e-4, t2);
      g2.gain.exponentialRampToValueAtTime(peak, t2 + 1.2);
      g2.gain.exponentialRampToValueAtTime(1e-4, t2 + def.padDur);
      osc.connect(g2).connect(this.gain);
      osc.start(t2);
      osc.stop(t2 + def.padDur + 0.1);
    }
  }
  _kick(t2, def) {
    const ctx = this.sfx.ctx;
    const osc = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, t2);
    osc.frequency.exponentialRampToValueAtTime(40, t2 + 0.18);
    g2.gain.setValueAtTime(def.kickPeak, t2);
    g2.gain.exponentialRampToValueAtTime(1e-4, t2 + 0.22);
    osc.connect(g2).connect(this.gain);
    osc.start(t2);
    osc.stop(t2 + 0.25);
  }
  _blip(freq, t2, def) {
    const ctx = this.sfx.ctx;
    const osc = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc.type = def.arpWave;
    osc.frequency.setValueAtTime(freq, t2);
    g2.gain.setValueAtTime(1e-4, t2);
    g2.gain.exponentialRampToValueAtTime(def.arpPeak, t2 + 8e-3);
    g2.gain.exponentialRampToValueAtTime(1e-4, t2 + def.arpDur);
    osc.connect(g2).connect(this.gain);
    osc.start(t2);
    osc.stop(t2 + def.arpDur + 0.03);
  }
};
export var SoundManager = class {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem(MUTE_KEY) === "1";
    const saved = parseFloat(localStorage.getItem(VOL_KEY));
    this.volume = Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : DEFAULT_VOL;
    this._noiseBuf = null;
    this._lastAt = {};
    this.music = new MusicDirector(this);
    const unlock2 = () => {
      this._ensureCtx();
      this.music.onUnlock();
    };
    addEventListener("pointerdown", unlock2, { once: true });
    addEventListener("keydown", unlock2, { once: true });
  }
  _ensureCtx() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._gain();
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }
  _gain() {
    return this.muted ? 0 : this.volume;
  }
  _applyGain() {
    if (this.master) this.master.gain.setTargetAtTime(this._gain(), this.ctx.currentTime, 0.01);
  }
  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    this._applyGain();
    this.music.applyMute();
    return this.muted;
  }
  // 0..1 음량. 0 으로 내리면 음소거와 같은 효과라 음소거 표시도 함께 맞춰 준다.
  setVolume(v2) {
    this.volume = Math.min(1, Math.max(0, v2));
    localStorage.setItem(VOL_KEY, String(this.volume));
    this._applyGain();
    return this.volume;
  }
  // 같은 종류 소리가 한 프레임에 몰릴 때 과하게 겹치지 않도록 최소 간격을 둔다
  _throttle(key, gap) {
    const now = performance.now();
    if (this._lastAt[key] && now - this._lastAt[key] < gap) return false;
    this._lastAt[key] = now;
    return true;
  }
  _noise() {
    if (this._noiseBuf) return this._noiseBuf;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d2 = buf.getChannelData(0);
    for (let i = 0; i < d2.length; i++) d2[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }
  _env(gain, t0, peak, attack, decay) {
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setValueAtTime(1e-4, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(1e-4, t0 + attack + decay);
  }
  _tone({ freq, endFreq, type = "sine", dur = 0.15, peak = 0.5, delay = 0 }) {
    const ctx = this._ensureCtx();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    this._env(gain, t0, peak, Math.min(0.02, dur * 0.15), dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
  _burstNoise({ dur = 0.15, peak = 0.4, filterFreq = 1800, filterType = "lowpass", delay = 0 }) {
    const ctx = this._ensureCtx();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this._noise();
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = filterFreq;
    const gain = ctx.createGain();
    this._env(gain, t0, peak, 5e-3, dur);
    src.connect(filt).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }
  // ---------------------------------------------------------------- 이벤트별 사운드
  // 타워 종류별로 명중음이 다르다: 화살탑은 날카로운 타격음,
  // 서리탑은 얼음 챙그랑, 대포탑은 낮은 굉음, 독탑은 축축한 쉭 소리.
  towerHit(key = "arrow") {
    if (!this._throttle("towerHit:" + key, 40)) return;
    if (key === "frost") {
      this._tone({ freq: 1500, endFreq: 2e3, type: "sine", dur: 0.11, peak: 0.16 });
      this._burstNoise({ dur: 0.05, peak: 0.08, filterFreq: 4e3, filterType: "highpass" });
    } else if (key === "cannon") {
      this._burstNoise({ dur: 0.14, peak: 0.28, filterFreq: 500 });
      this._tone({ freq: 90, endFreq: 45, type: "sine", dur: 0.16, peak: 0.24 });
    } else if (key === "poison") {
      this._burstNoise({ dur: 0.12, peak: 0.16, filterFreq: 700 });
    } else {
      this._burstNoise({ dur: 0.08, peak: 0.22, filterFreq: 2400 });
    }
  }
  meleeHit() {
    this._burstNoise({ dur: 0.09, peak: 0.35, filterFreq: 1400 });
    this._tone({ freq: 180, endFreq: 90, type: "square", dur: 0.08, peak: 0.15 });
  }
  meleeSwing() {
    if (!this._throttle("swing", 100)) return;
    this._burstNoise({ dur: 0.12, peak: 0.12, filterFreq: 3200, filterType: "highpass" });
  }
  enemyDeath() {
    if (!this._throttle("death", 30)) return;
    this._tone({ freq: 320, endFreq: 60, type: "sawtooth", dur: 0.22, peak: 0.22 });
  }
  bossDeath() {
    this._tone({ freq: 380, endFreq: 40, type: "sawtooth", dur: 0.4, peak: 0.32 });
    this._tone({ freq: 90, endFreq: 30, type: "sine", dur: 0.5, peak: 0.4, delay: 0.05 });
    this._burstNoise({ dur: 0.3, peak: 0.3, filterFreq: 700 });
  }
  build() {
    this._tone({ freq: 140, endFreq: 100, type: "square", dur: 0.1, peak: 0.3 });
    this._burstNoise({ dur: 0.06, peak: 0.25, filterFreq: 900, delay: 0.03 });
  }
  upgrade() {
    this._tone({ freq: 440, type: "sine", dur: 0.09, peak: 0.28 });
    this._tone({ freq: 660, type: "sine", dur: 0.14, peak: 0.24, delay: 0.07 });
  }
  sell() {
    this._tone({ freq: 500, endFreq: 260, type: "triangle", dur: 0.16, peak: 0.25 });
  }
  harvestDone(type) {
    this._tone({ freq: type === "tree" ? 620 : 380, type: "triangle", dur: 0.1, peak: 0.22 });
  }
  waveStart() {
    this._tone({ freq: 200, endFreq: 340, type: "sawtooth", dur: 0.45, peak: 0.3 });
    this._tone({ freq: 150, endFreq: 250, type: "sawtooth", dur: 0.5, peak: 0.22, delay: 0.08 });
  }
  // 보스가 포함된 웨이브는 낮은 경적을 겹쳐 위협을 강조한다
  bossWaveStart() {
    this.waveStart();
    this._tone({ freq: 70, type: "sawtooth", dur: 0.9, peak: 0.32, delay: 0.15 });
    this._tone({ freq: 66, type: "sawtooth", dur: 0.9, peak: 0.28, delay: 0.55 });
  }
  waveClear() {
    this._tone({ freq: 523, type: "sine", dur: 0.12, peak: 0.25 });
    this._tone({ freq: 659, type: "sine", dur: 0.12, peak: 0.25, delay: 0.1 });
    this._tone({ freq: 784, type: "sine", dur: 0.22, peak: 0.25, delay: 0.2 });
  }
  buildingHit() {
    if (!this._throttle("bhit", 90)) return;
    this._burstNoise({ dur: 0.07, peak: 0.16, filterFreq: 1100 });
  }
  crystalHit() {
    if (!this._throttle("crystal", 120)) return;
    this._tone({ freq: 110, endFreq: 55, type: "sine", dur: 0.3, peak: 0.4 });
    this._burstNoise({ dur: 0.1, peak: 0.2, filterFreq: 500 });
  }
  playerHurt() {
    if (!this._throttle("hurt", 150)) return;
    this._tone({ freq: 160, endFreq: 80, type: "square", dur: 0.16, peak: 0.22 });
  }
  // 크리스탈 체력이 위험 수준(30% 미만)으로 처음 떨어졌을 때 한 번 울리는 경보음
  crystalDanger() {
    this._tone({ freq: 480, endFreq: 260, type: "square", dur: 0.18, peak: 0.32 });
    this._tone({ freq: 480, endFreq: 260, type: "square", dur: 0.18, peak: 0.28, delay: 0.24 });
  }
  playerDown() {
    this._tone({ freq: 300, endFreq: 60, type: "sawtooth", dur: 0.5, peak: 0.3 });
  }
  shard() {
    this._tone({ freq: 700, type: "sine", dur: 0.14, peak: 0.22 });
    this._tone({ freq: 1050, type: "sine", dur: 0.2, peak: 0.18, delay: 0.09 });
  }
  denied() {
    this._tone({ freq: 160, type: "square", dur: 0.1, peak: 0.18 });
  }
  click() {
    this._tone({ freq: 900, type: "sine", dur: 0.04, peak: 0.12 });
  }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone({ freq: f, type: "sine", dur: 0.3, peak: 0.28, delay: i * 0.14 }));
  }
  lose() {
    [220, 196, 174, 130].forEach((f, i) => this._tone({ freq: f, type: "sawtooth", dur: 0.35, peak: 0.26, delay: i * 0.16 }));
  }
};
