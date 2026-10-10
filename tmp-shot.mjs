import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = await mkdtemp(path.join(tmpdir(), 'lm-edge-'));
const proc = spawn(edge, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9223', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const login = await fetch('http://127.0.0.1:3000/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@example.com', password: 'admin12345' }),
});
const cookie = login.headers.getSetCookie().find((c) => c.startsWith('lm_session='));
if (!login.ok || !cookie) throw new Error('login failed');
const token = cookie.split(';')[0].slice('lm_session='.length);

let wsUrl = '';
for (let i = 0; i < 20 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try {
    const list = await fetch('http://127.0.0.1:9223/json/list').then((r) => r.json());
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? '';
  } catch { /* retry */ }
}
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === 'Runtime.exceptionThrown') logs.push(String(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || '').slice(0, 500));
  if (msg.id && pending.has(msg.id)) {
    const job = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) job.reject(new Error(JSON.stringify(msg.error)));
    else job.resolve(msg.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const msgId = ++id;
  pending.set(msgId, { resolve, reject });
  ws.send(JSON.stringify({ id: msgId, method, params }));
});
await send('Runtime.enable');
await send('Network.setCookie', { name: 'lm_session', value: token, url: 'http://127.0.0.1:3000/', httpOnly: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 2400, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:3000/admin' });
let info = '';
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 400));
  const probe = await send('Runtime.evaluate', {
    expression: `JSON.stringify({ text: document.body.innerText.includes('Accepted'), names: [...document.querySelectorAll('h2')].map(h => h.textContent) })`,
    returnByValue: true,
  });
  info = probe.result?.value ?? '';
  if (info.includes('"text":true')) break;
}
await send('Runtime.evaluate', { expression: `document.querySelector('h2') && [...document.querySelectorAll('h2')].find(h => h.textContent === 'Accepted')?.scrollIntoView({ block: 'start' })` });
await new Promise((r) => setTimeout(r, 300));
const shot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile('D:/Bid/LinkMarket/tmp-admin-accepted.png', Buffer.from(shot.data, 'base64'));
console.log(info);
console.log(logs.slice(0, 4).join('\n---\n'));
ws.close();
proc.kill();
await new Promise((r) => setTimeout(r, 300));
await rm(profile, { recursive: true, force: true }).catch(() => undefined);
