import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StateStore } from './store.js';
import { handleRequest } from './bridge.js';
import { dataDirectory } from './paths.js';
import type { QuotaSnapshot } from './shared/types.js';
import { VERSION } from './runtime.js';

async function body(request: IncomingMessage) {
  const chunks: Buffer[] = []; let length = 0;
  for await (const part of request) { length += part.length; if (length > 2_000_000) throw new Error('Request too large.'); chunks.push(part); }
  return Buffer.concat(chunks).toString('utf8');
}

export async function startDemo() {
  const key = randomBytes(24).toString('hex');
  const store = await StateStore.open(join(dataDirectory(), 'demo', 'state.json'));
  const renderer = await readFile(fileURLToPath(new URL('./renderer.js', import.meta.url)), 'utf8');
  const quota: QuotaSnapshot = { fetchedAt: new Date().toISOString(), windows: [
    { id: 'codex:primary', label: 'Sample · 5h', usedPercent: 28, remainingPercent: 72, resetsAt: Math.floor(Date.now() / 1000) + 7400, windowDurationMins: 300 },
    { id: 'codex:secondary', label: 'Sample · 7d', usedPercent: 46, remainingPercent: 54, resetsAt: Math.floor(Date.now() / 1000) + 260000, windowDurationMins: 10080 },
  ] };
  let origin = '';
  let detached = false;
  const page = () => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Codex Sidecar · Component preview</title><style>
  *{box-sizing:border-box}body{margin:0;background:#fafbfe;color:#28364c;font:15px/1.7 system-ui,"Segoe UI",sans-serif}header{height:62px;border-bottom:1px solid #e5e9f2;background:#fff;display:flex;align-items:center;padding:0 28px;gap:12px}header .mark{width:30px;height:30px;border-radius:10px;background:#6679d7;color:white;display:grid;place-items:center;font-weight:700}header small{color:#7b8495}header .actions{margin-left:auto;display:flex;align-items:center;gap:14px}button{font:inherit;border:1px solid #dce2ed;background:#fff;border-radius:9px;padding:5px 12px;color:#43526a}main{max-width:820px;margin:76px auto;padding:0 44px}.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7483c9}h1{font-size:34px;line-height:1.25;letter-spacing:-.035em;font-weight:650;margin:14px 0 24px}p{color:#69768a}.callout{background:#eef2ff;border:1px solid #e0e6ff;border-radius:14px;padding:17px 20px;margin:30px 0}.callout strong{font-size:13px;color:#5267b4}.callout p{font-size:13px;margin:5px 0 0}.message{border-top:1px solid #e7ebf3;padding-top:24px;margin-top:30px}.message h2{font-size:17px;font-weight:600}.composer{margin-top:40px;width:100%;min-height:90px;padding:16px 18px;border:1px solid #dfe5f0;border-radius:17px;background:white;resize:vertical;font:inherit;box-shadow:0 6px 26px #31457608}.caption{font-size:12px;color:#9aa3b0;text-align:center;margin-top:12px}@media(max-width:600px){main{margin:38px auto;padding:0 25px}h1{font-size:28px}header small{display:none}}
  </style></head><body><header id="sidecar-demo-titlebar"><span class="mark">S</span><strong>Codex Sidecar</strong><small>Component preview</small><div class="actions"><button aria-label="Demo workspace">Preview</button></div></header><main><div class="eyebrow">Your tools, close at hand</div><h1>给常用的小功能，<br>一个顺手的位置。</h1><p>顶部看额度，右侧放便签和收藏。需要时展开，用完就收起来。</p><div class="callout"><strong>独立演示 · Sample data</strong><p>这里的额度是示例，便签保存在单独的演示目录。当前 Codex 窗口没有被修改。</p></div><section class="message"><h2>试试右侧的工具栏</h2><p>把鼠标移到右侧入口，或点击打开。可以保存便签、收藏链接，再开一个预览窗口检查同步。下面的输入框用于确认组件不会干扰原界面的输入。</p><textarea class="composer" aria-label="Demo native composer" placeholder="这里仍然可以正常输入和选择文字……"></textarea><div class="caption">Codex Sidecar ${VERSION} · unofficial companion</div></section></main><script>
  const key=${JSON.stringify(key)};
  async function snapshot(){const r=await fetch('/api/snapshot',{headers:{'X-Sidecar-Key':key}});if(r.ok){const s=await r.json();if(s.detached)window.__CODEX_SIDECAR__?.destroy();else window.__CODEX_SIDECAR__?.receive(s)}}
  window.__CODEX_SIDECAR_BOOT__={demo:true,version:${JSON.stringify(VERSION)}};
  window.__codexSidecarSend=async payload=>{try{const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-Sidecar-Key':key},body:payload});window.__CODEX_SIDECAR__?.receive(await r.json());await snapshot()}catch{window.__CODEX_SIDECAR__?.receive({type:'result',id:JSON.parse(payload).id,ok:false,error:'Demo server is unavailable.'})}};
  setInterval(snapshot,2000);
  </script><script src="/renderer.js"></script></body></html>`;

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    const host = new URL(origin).host;
    if (request.headers.host !== host || (request.headers.origin && request.headers.origin !== origin)) { response.writeHead(403); response.end(); return; }
    try {
      if (request.method === 'GET' && request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(page()); return; }
      if (request.method === 'GET' && request.url === '/renderer.js') { response.setHeader('Content-Type', 'text/javascript; charset=utf-8'); response.end(renderer); return; }
      if (request.headers['x-sidecar-key'] !== key) { response.writeHead(403); response.end(); return; }
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (request.method === 'GET' && request.url === '/api/snapshot') { response.end(JSON.stringify({ type: 'snapshot', state: store.snapshot, quota, detached })); return; }
      if (request.method === 'POST' && request.url === '/api/action') {
        const result = await handleRequest(await body(request), { store, refreshQuota: async () => { quota.fetchedAt = new Date().toISOString(); }, openLink: async () => { throw new Error('Demo does not open external apps; this action is available in the desktop companion.'); }, detach: async () => { detached = true; } });
        response.end(JSON.stringify(result)); return;
      }
      response.writeHead(404); response.end('{}');
    } catch { response.writeHead(400); response.end(JSON.stringify({ type: 'result', id: '', ok: false, error: 'Invalid demo request.' })); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Demo port was unavailable.');
  origin = `http://127.0.0.1:${address.port}`;
  console.log(`DEMO_URL=${origin}`);
  console.log('Preview uses sample quota and a separate local data store. Press Ctrl+C to stop.');
  process.once('SIGINT', () => { server.close(); server.closeAllConnections(); });
  process.once('SIGTERM', () => { server.close(); server.closeAllConnections(); });
}
