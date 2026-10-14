/* A deliberately narrow VLESS-over-WebSocket → outbound TCP bridge.
 * Only authenticated credentials, domain destinations, and ports 80/443 are accepted.
 * No UDP, arbitrary IP connections, packet VPN, or DPI-bypass guarantee. */
import { connect } from 'cloudflare:sockets';
import { InputError, parseVlessHeader } from '../shared/market.js';

const MAX_HEADER = 4096;
const MAX_STREAM_BYTES = 250 * 1024 * 1024;

export async function handleEdge(request, stub, ctx) {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('WebSocket required', { status: 426, headers: { 'cache-control': 'no-store' } });
  }
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  let partial = new Uint8Array(0);
  let writer;
  let socket;
  let closed = false;
  let bytes = 0;
  let initialized = false;
  let queue = Promise.resolve();

  const close = (code = 1000, reason = '') => {
    if (closed) return;
    closed = true;
    try { server.close(code, reason.slice(0, 90)); } catch { /* already closed */ }
    try { socket?.close(); } catch { /* already closed */ }
    try { writer?.releaseLock(); } catch { /* already released */ }
  };
  const readUpstream = async () => {
    let reader;
    try {
      reader = socket.readable.getReader();
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_STREAM_BYTES) throw new Error('stream_limit');
        server.send(value);
      }
    } catch { /* normal when either peer disconnects */ }
    finally {
      try { reader?.releaseLock(); } catch { /* ignore */ }
      close();
    }
  };
  const onMessage = async (event) => {
    if (closed) return;
    if (!(event.data instanceof ArrayBuffer) && !ArrayBuffer.isView(event.data)) throw new InputError('Binary WebSocket only');
    const chunk = new Uint8Array(event.data);
    bytes += chunk.byteLength;
    if (bytes > MAX_STREAM_BYTES) throw new InputError('Connection limit');
    if (initialized) { await writer.write(chunk); return; }
    if (partial.length + chunk.length > MAX_HEADER) throw new InputError('Header too long');
    const joined = new Uint8Array(partial.length + chunk.length);
    joined.set(partial);
    joined.set(chunk, partial.length);
    partial = joined;
    const header = parseVlessHeader(partial);
    if (!header) return; // fragmented header; wait for next WebSocket frame
    const authorization = await stub.fetch('https://state/internal/access', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uuid: header.uuid }),
    });
    if (!(await authorization.json()).allowed) throw new InputError('Invalid or expired credential');
    socket = connect({ hostname: header.domain, port: header.port }, { allowHalfOpen: false });
    await socket.opened;
    writer = socket.writable.getWriter();
    initialized = true;
    partial = new Uint8Array(0);
    // VLESS response: protocol version + zero additional data.
    server.send(new Uint8Array([0, 0]));
    if (header.payload.length) await writer.write(header.payload);
    ctx.waitUntil(readUpstream());
  };
  server.addEventListener('message', (event) => {
    queue = queue.then(() => onMessage(event)).catch(() => close(1008, 'Connection refused'));
  });
  server.addEventListener('close', () => close());
  server.addEventListener('error', () => close(1011, 'Connection error'));
  return new Response(null, { status: 101, webSocket: client });
}
