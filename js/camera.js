// 이 게임에서 가장 중요한 카메라 시스템.
// 플레이어의 월드 좌표를 기준으로 카메라 x를 계산하고,
// 렌더링 시 모든 오브젝트는 (worldX - camera.x) 로 화면 좌표를 구한다.
// 그 결과 플레이어는 화면 중앙에 고정되고 월드가 반대로 흐르는 것처럼 보인다.
class Camera {
  constructor() {
    this.x = 0;
  }
  update(targetX, worldWidth) {
    let camX = targetX - LOGICAL_W / 2;
    const maxCamX = Math.max(0, worldWidth - LOGICAL_W);
    this.x = clamp(camX, 0, maxCamX); // 맵 양 끝에서는 더 이상 이동하지 않음
  }
  toScreenX(worldX) {
    return worldX - this.x;
  }
}
