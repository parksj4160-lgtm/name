// 파티 = 같은 방에 실제로 접속한 플레이어들. AI 더미는 존재하지 않는다.
// 네트워크에서 받은 스냅샷으로 RemotePlayer를 생성/갱신/제거한다.
class Party {
  constructor(player) {
    this.player = player;
    this.remotes = new Map(); // id -> RemotePlayer
  }

  get members() { return [...this.remotes.values()]; }
  get size() { return 1 + this.remotes.size; }
  get isFull() { return this.size >= PARTY_MAX; }

  applyPlayerSnapshot(id, s) {
    if (!s || id === this.player.id) return;
    let rp = this.remotes.get(id);
    if (!rp) {
      if (this.remotes.size >= PARTY_MAX - 1) return; // 4인 초과는 받지 않음
      rp = new RemotePlayer({ ...s, id });
      this.remotes.set(id, rp);
    }
    rp.applySnapshot(s);
  }

  remove(id) { this.remotes.delete(id); }
  clear() { this.remotes.clear(); }

  update(dt) {
    const now = performance.now();
    for (const [id, rp] of [...this.remotes]) {
      rp.update(dt);
      if (now - rp.lastSeen > 5000) this.remotes.delete(id); // 응답 없으면 정리
    }
  }

  // 같은 장소(씬 + 층)에 있는 원격 플레이어만
  inPlace(sceneKey, floor) {
    return this.members.filter(rp => rp.scene === sceneKey && rp.floor === floor);
  }

  // 몬스터가 노릴 수 있는 대상 목록 (본인 + 같은 장소의 실제 플레이어)
  targets(sceneKey, floor) {
    const list = [this.player];
    this.inPlace(sceneKey, floor).forEach(rp => { if (rp.hp > 0) list.push(rp); });
    return list;
  }

  draw(ctx, camera, sceneKey, floor) {
    this.inPlace(sceneKey, floor).forEach(rp => {
      const sx = camera.toScreenX(rp.x);
      if (sx > -80 && sx < LOGICAL_W + 80) rp.draw(ctx, sx);
    });
  }
}
