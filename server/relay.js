// 다른 기기(친구 PC / 휴대폰)와 함께 플레이할 때만 필요한 아주 작은 릴레이 서버.
// 외부 패키지 없이 Node 기본 모듈만 사용한다.
//
//   실행:  node server/relay.js            (기본 포트 8080)
//         PORT=9000 node server/relay.js
//
//   게임 설정(⚙) → "멀티플레이 서버"에 ws://<서버IP>:8080 입력
//
// 서버는 아무 게임 로직도 하지 않고, 같은 방(room)에 있는 다른 접속자에게 메시지를 그대로 전달만 한다.

const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** room -> Set<socket> */
const rooms = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('RPG relay server running. Connect with WebSocket: ws://<host>:' + PORT + '?room=CODE\n');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }

  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const url = new URL(req.url, 'http://localhost');
  const room = (url.searchParams.get('room') || 'LOBBY').toUpperCase();

  if (!rooms.has(room)) rooms.set(room, new Set());
  const peers = rooms.get(room);
  peers.add(socket);
  console.log(`[+] join room=${room} (${peers.size}명)`);

  socket.setNoDelay(true);
  let buf = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const frame = decodeFrame(buf);
      if (!frame) break;
      buf = buf.slice(frame.total);

      if (frame.opcode === 0x8) { socket.end(); return; }        // close
      if (frame.opcode === 0x9) { socket.write(encodeFrame(frame.payload, 0xA)); continue; } // ping
      if (frame.opcode !== 0x1) continue;                        // 텍스트만 중계

      const out = encodeFrame(frame.payload, 0x1);
      for (const p of peers) {
        if (p !== socket && !p.destroyed) p.write(out);
      }
    }
  });

  const cleanup = () => {
    peers.delete(socket);
    if (peers.size === 0) rooms.delete(room);
    console.log(`[-] leave room=${room} (${peers.size}명)`);
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

// ---- WebSocket 프레임 디코딩(클라이언트 → 서버, 항상 마스킹됨) ----
function decodeFrame(b) {
  if (b.length < 2) return null;
  const opcode = b[0] & 0x0f;
  const masked = (b[1] & 0x80) === 0x80;
  let len = b[1] & 0x7f;
  let off = 2;

  if (len === 126) {
    if (b.length < off + 2) return null;
    len = b.readUInt16BE(off); off += 2;
  } else if (len === 127) {
    if (b.length < off + 8) return null;
    len = Number(b.readBigUInt64BE(off)); off += 8;
  }

  let mask = null;
  if (masked) {
    if (b.length < off + 4) return null;
    mask = b.slice(off, off + 4); off += 4;
  }
  if (b.length < off + len) return null;

  const data = Buffer.from(b.slice(off, off + len));
  if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];

  return { opcode, payload: data, total: off + len };
}

// ---- 서버 → 클라이언트 프레임(마스킹 없음) ----
function encodeFrame(payload, opcode = 0x1) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

server.listen(PORT, () => {
  console.log(`RPG relay listening on ws://0.0.0.0:${PORT}`);
  console.log('게임 설정에서 ws://<이 컴퓨터의 IP>:' + PORT + ' 를 입력하세요.');
});
