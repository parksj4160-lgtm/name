var MUTE_KEY = "cd.muted";
var VOL_KEY = "cd.volume";
var DEFAULT_VOL = 0.55;
export var SoundManager = class {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem(MUTE_KEY) === "1";
    const saved = parseFloat(localStorage.getItem(VOL_KEY));
    this.volume = Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : DEFAULT_VOL;
    this._noiseBuf = null;
    this._lastAt = {};
    const unlock = () => {
      this._ensureCtx();
    };
    addEventListener("pointerdown", unlock, { once: true });
    addEventListener("keydown", unlock, { once: true });
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
