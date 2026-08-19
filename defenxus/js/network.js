class NetworkManager {
  constructor() {
    this.isHost = false;
    this.roomCode = null;
    this.players = [];
    this.socket = null;
    this.broadcastChannel = null;
    this.joinTs = Date.now();

    this.tryBroadcastChannel();
  }

  tryBroadcastChannel() {
    try {
      this.broadcastChannel = new BroadcastChannel('defenxus-room');
      this.broadcastChannel.onmessage = (event) => this.handleMessage(event.data);
    } catch (e) {
      console.log('BroadcastChannel not supported, using WebSocket fallback');
    }
  }

  createRoom() {
    this.isHost = true;
    this.roomCode = this.generateRoomCode();
    this.players = [
      {
        id: 'player-' + this.joinTs,
        name: '플레이어 1',
        ready: false,
      },
    ];

    this.broadcastState();
    window.uiManager.updateLobby(this.players.length, this.players, this.roomCode);
  }

  joinRoom(code) {
    this.roomCode = code;
    this.players.push({
      id: 'player-' + this.joinTs,
      name: '플레이어 ' + (Math.floor(Math.random() * 1000) % 100),
      ready: false,
    });

    this.broadcastState();
    window.uiManager.updateLobby(this.players.length, this.players, this.roomCode);
  }

  leaveRoom() {
    this.roomCode = null;
    this.players = [];
    this.isHost = false;
  }

  startGame() {
    if (this.isHost) {
      this.broadcast({
        type: 'game-start',
        roomCode: this.roomCode,
      });
      window.gameManager?.startGame('multiplayer', this.players);
    }
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  broadcast(data) {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(data);
    }
  }

  handleMessage(data) {
    if (data.type === 'game-start') {
      window.gameManager?.startGame('multiplayer', data.players || this.players);
    }
  }
}

window.networkManager = new NetworkManager();
