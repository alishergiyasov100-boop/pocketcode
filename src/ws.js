/* ============================================================
   Минимальный WebSocket-сервер (RFC 6455) без зависимостей.
   Нужен только текстовый кадр в обе стороны, ping/pong и close.
   ============================================================ */
"use strict";
const crypto = require("crypto");
const { EventEmitter } = require("events");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

class Socket extends EventEmitter {
  constructor(raw) {
    super();
    this.raw = raw;
    this.open = true;
    this.buf = Buffer.alloc(0);
    raw.on("data", (d) => this._feed(d));
    raw.on("close", () => this._dead());
    raw.on("error", () => this._dead());
    this._ping = setInterval(() => this.ping(), 25000);
  }

  _dead() {
    if (!this.open) return;
    this.open = false;
    clearInterval(this._ping);
    this.emit("close");
  }

  _feed(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const f = decode(this.buf);
      if (!f) return;
      this.buf = this.buf.slice(f.size);
      if (f.op === 8) { this.close(); return; }
      if (f.op === 9) { this.raw.write(encode(f.payload, 10)); continue; }
      if (f.op === 10) continue;
      if (f.op === 1) this.emit("message", f.payload.toString("utf8"));
    }
  }

  send(text) {
    if (!this.open) return;
    try { this.raw.write(encode(Buffer.from(String(text), "utf8"), 1)); }
    catch (e) { this._dead(); }
  }

  ping() { if (this.open) { try { this.raw.write(encode(Buffer.alloc(0), 9)); } catch (e) { this._dead(); } } }

  close() {
    if (!this.open) return;
    try { this.raw.write(encode(Buffer.alloc(0), 8)); this.raw.end(); } catch (e) {}
    this._dead();
  }
}

/* кадр от клиента всегда замаскирован */
function decode(b) {
  if (b.length < 2) return null;
  const op = b[0] & 0x0f;
  const masked = (b[1] & 0x80) === 0x80;
  let len = b[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    if (b.length < 4) return null;
    len = b.readUInt16BE(2); off = 4;
  } else if (len === 127) {
    if (b.length < 10) return null;
    const hi = b.readUInt32BE(2), lo = b.readUInt32BE(6);
    if (hi !== 0) return null;              /* больше 4 ГБ нам не нужно */
    len = lo; off = 10;
  }
  const maskLen = masked ? 4 : 0;
  if (b.length < off + maskLen + len) return null;
  const mask = masked ? b.slice(off, off + 4) : null;
  const start = off + maskLen;
  const payload = Buffer.from(b.slice(start, start + len));
  if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  return { op, payload, size: start + len };
}

function encode(payload, op) {
  const len = payload.length;
  let head;
  if (len < 126) {
    head = Buffer.alloc(2);
    head[1] = len;
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeUInt32BE(0, 2);
    head.writeUInt32BE(len, 6);
  }
  head[0] = 0x80 | op;
  return Buffer.concat([head, payload]);
}

/** подключить апгрейд к обычному http-серверу */
function attach(server, path, onConnect) {
  server.on("upgrade", (req, socket) => {
    if (path && req.url.split("?")[0] !== path) { socket.destroy(); return; }
    const key = req.headers["sec-websocket-key"];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
    );
    socket.setNoDelay(true);
    onConnect(new Socket(socket), req);
  });
}

module.exports = { attach, Socket };
