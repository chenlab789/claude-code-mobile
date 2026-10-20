// Claude Voice — talk to Claude Code on your PC from your phone:
// hold to talk on the phone → claude -p (one continuous session) → edge-tts → audio back to the phone.
// Binds 127.0.0.1 only; expose it inside your tailnet with `tailscale serve --bg --https=8443 http://127.0.0.1:8780`
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile, execFileSync } = require('child_process');

const ROOT = __dirname;
const ENV_FILE = path.join(ROOT, '.env');
if (!fs.existsSync(ENV_FILE)) { console.error('missing .env: copy .env.example to .env and set a PIN'); process.exit(1); }
const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').replace(/^﻿/, '').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const PIN = env.PIN;
if (!PIN || PIN.length < 4) { console.error('set PIN (4+ digits) in .env'); process.exit(1); }
const PORT = Number(env.PORT || 8780);
const VOICE = env.VOICE || 'en-US-AndrewNeural';
const RATE = env.RATE || '+10%';
const REPLY_LANG = env.REPLY_LANG || 'the language the user speaks';
const SPEECH_LANG = env.SPEECH_LANG || 'en-US';   // on-device speech recognition (BCP-47)
const STT_LANG = env.STT_LANG || '';              // ElevenLabs language_code, empty = auto-detect
// resolve an executable from PATH; prefer the real .exe — spawning npm's .cmd shim without a shell fails on Windows
function which(name, override) {
  if (override) return override;
  try {
    const hits = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
    return hits.find(h => /\.exe$/i.test(h)) || hits[0];
  } catch { return name; }
}
function claudeBin() {
  if (env.CLAUDE_BIN) return env.CLAUDE_BIN;
  const hit = which('claude');
  if (process.platform !== 'win32' || /\.exe$/i.test(hit)) return hit;
  // npm install puts only shims on PATH — the native binary sits inside the package
  const exe = path.join(path.dirname(hit), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  return fs.existsSync(exe) ? exe : hit;
}
const CLAUDE = claudeBin();
const EDGE_TTS = which('edge-tts', env.EDGE_TTS);
const CLAUDE_CWD = env.WORKDIR || os.homedir();
const TMP = path.join(ROOT, 'tmp');
const STATE = path.join(ROOT, 'state.json');
// chat history shown on screen — survives closing the app, cleared only by "new session"
const HIST = path.join(ROOT, 'history.json');
let hist = (() => { try { return JSON.parse(fs.readFileSync(HIST, 'utf8')); } catch { return []; } })();
let histTimer = null;
const saveHist = (now) => {
  if (hist.length > 400) hist = hist.slice(-400);
  clearTimeout(histTimer);
  const w = () => fs.writeFile(HIST, JSON.stringify(hist), () => {});
  if (now) w(); else histTimer = setTimeout(w, 800);
};
const recordEvent = o => {
  const last = hist[hist.length - 1];
  if (o.type === 'text') { if (last && last.t === 'ai' && last.open) last.text += o.t; else hist.push({ t: 'ai', text: o.t, open: true }); }
  else if (o.type === 'tool') hist.push({ t: 'tool', name: o.name });
  else if (o.type === 'image' || o.type === 'video') hist.push({ t: o.type, url: o.url });
  else if (o.type === 'done') { for (const h of hist) delete h.open; if (o.code) hist.push({ t: 'err', text: 'exited with error ' + o.code }); return saveHist(true); }
  else return;
  if (o.type !== 'text' && last) delete last.open;
  saveHist();
};
const LOG = path.join(ROOT, 'logs');
fs.mkdirSync(TMP, { recursive: true });
const UP = path.join(TMP, 'up'); // files attached from the phone
fs.mkdirSync(UP, { recursive: true });
fs.mkdirSync(LOG, { recursive: true });

const VOICE_PROMPT = [
  `The user is talking to you by voice from their phone. Your replies are read aloud by text-to-speech. Reply in ${REPLY_LANG}.`,
  '- Keep it short: 1-3 spoken sentences, unless the user asks for a long explanation.',
  '- No markdown, tables, bullets, code, emoji or long URLs in replies — they sound like nonsense when read aloud.',
  '- Round big numbers and say them the way a person would ("about two hundred thirty thousand").',
  '- For tasks that take a while with tools, first say in one short sentence what you are about to do, then do it, then summarize the result briefly.',
  '- The user\'s messages are speech-to-text and may be misspelled — infer the meaning from context.',
  '- The user is not at the computer, so AskUserQuestion does not work. If you need to ask, ask in your reply and end the turn.',
  `- You can show images or videos in the app: put [[img:C:\\full\\path\\file.png]] in your reply (png/jpg/gif/webp or mp4/webm/mov; the marker is not read aloud). Screenshot the PC with \`powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(ROOT, 'shot.ps1')}"\` — it prints the image path.`,
].join('\n');

const IMG_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/mp4' };
// copy the image into tmp under a random name and return a url the phone can load
function publishImage(file) {
  const ext = path.extname(file).toLowerCase();
  if (!IMG_EXT[ext] || !fs.existsSync(file)) return null;
  const name = crypto.randomBytes(12).toString('hex') + ext;
  fs.copyFileSync(file, path.join(TMP, name));
  return `/img/${name}`;
}

const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
const saveState = s => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
const log = (...a) => fs.appendFileSync(path.join(LOG, 'server.log'), `[${new Date().toISOString()}] ${a.join(' ')}\n`);

// ---------- speech helpers ----------
function speakable(s) {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_#>|~]+/g, ' ')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tts(text) {
  return new Promise(resolve => {
    const id = crypto.randomBytes(12).toString('hex');
    const txt = path.join(TMP, id + '.txt');
    const mp3 = path.join(TMP, id + '.mp3');
    fs.writeFileSync(txt, text, 'utf8');
    execFile(EDGE_TTS, ['--voice', VOICE, '--rate', RATE, '-f', txt, '--write-media', mp3],
      { timeout: 60000, windowsHide: true }, err => {
        fs.rm(txt, () => {});
        if (err) { log('tts error', err.message); return resolve(null); }
        resolve(`/audio/${id}.mp3`);
      });
  });
}

// ---------- claude job ----------
let current = null; // { child, listeners:Set }

function killJob() {
  if (!current) return;
  try { execFile('taskkill', ['/PID', String(current.child.pid), '/T', '/F'], { windowsHide: true }); } catch {}
  current = null;
}

function runClaude(text, send) {
  const state = loadState();
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--dangerously-skip-permissions', '--append-system-prompt', VOICE_PROMPT];
  if (state.sessionId) args.push('--resume', state.sessionId);

  const child = spawn(CLAUDE, args, { cwd: CLAUDE_CWD, windowsHide: true, env: { ...process.env, CLAUDE_VOICE: '1' } });
  current = { child };
  child.stdin.end(text, 'utf8');
  log('ask', state.sessionId || 'new', JSON.stringify(text));

  let buf = '';        // stdout line buffer
  let speech = '';     // text waiting to be spoken
  let full = '';
  let audioChain = Promise.resolve();

  const flush = (force) => {
    // split into spoken chunks: newline / sentence end, or long enough and at a space (Thai puts spaces between sentences)
    while (true) {
      let cut = -1;
      const m = speech.match(/\n+|[.!?](?=\s|$)/);
      if (m && m.index > 0) cut = m.index + m[0].length;
      else if (speech.length > 60) { const sp = speech.indexOf(' ', 40); if (sp > 0) cut = sp + 1; }
      if (cut < 0) { if (force && speech.trim()) cut = speech.length; else break; }
      const chunk = speakable(speech.slice(0, cut));
      speech = speech.slice(cut);
      if (chunk.length > 1) {
        const p = tts(chunk);
        audioChain = audioChain.then(() => p).then(url => url && send({ type: 'audio', url }));
      }
      if (!speech) break;
    }
  };

  // pull [[img:path]] markers out of the text — hold back a tail that may be half a marker until it completes
  let pend = '';
  const emitText = (force) => {
    let out = '';
    while (true) {
      const s = pend.indexOf('[[img:');
      if (s < 0) {
        let k = force ? 0 : 5;
        while (k > 0 && !pend.endsWith('[[img:'.slice(0, k))) k--;
        const cut = pend.length - k;
        out += pend.slice(0, cut); pend = pend.slice(cut); break;
      }
      const end = pend.indexOf(']]', s);
      if (end < 0) { out += pend.slice(0, s); pend = pend.slice(s); if (force) { out += pend; pend = ''; } break; }
      out += pend.slice(0, s);
      const url = publishImage(pend.slice(s + 6, end).trim().replace(/^["']|["']$/g, ''));
      if (url) send({ type: IMG_EXT[path.extname(url)].startsWith('video') ? 'video' : 'image', url }); else log('img missing', pend.slice(s, end + 2));
      pend = pend.slice(end + 2);
    }
    if (out) { full += out; speech += out; send({ type: 'text', t: out }); flush(false); }
  };

  // context + rate limits → keep in state and push to the phone
  const setUsage = o => { state.usage = { ...state.usage, ...o }; saveState(state); send({ type: 'usage', usage: state.usage }); };
  const onEvent = ev => {
    if (ev.session_id && ev.session_id !== state.sessionId) { state.sessionId = ev.session_id; saveState(state); }
    if (ev.type === 'system' && ev.subtype === 'init' && ev.model) {
      let effort = null; try { effort = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8')).effortLevel || null; } catch {}
      setUsage({ model: ev.model, effort });
    }
    if (ev.type === 'result' && ev.total_cost_usd) setUsage({ cost: (state.usage?.cost || 0) + ev.total_cost_usd });
    if (ev.type === 'rate_limit_event') {
      const w = ev.rate_limit_info?.unifiedWindows || {}, pick = x => x && { pct: Math.round(x.utilization * 100), reset: x.resetsAt };
      setUsage({ five: pick(w.five_hour) || state.usage?.five, week: pick(w.seven_day) || state.usage?.week });
    } else if (ev.type === 'result' && ev.modelUsage) {
      const win = Math.max(...Object.values(ev.modelUsage).map(m => m.contextWindow || 0));
      if (win) setUsage({ win });
    } else if (ev.type === 'stream_event' && ev.parent_tool_use_id == null && ev.event?.type === 'message_start') {
      const u = ev.event.message?.usage;
      if (u) setUsage({ ctx: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) });
    }
    if (ev.type === 'stream_event' && ev.parent_tool_use_id == null) {
      const e = ev.event;
      if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
        send({ type: 'tool', name: e.content_block.name });
      } else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
        pend += e.delta.text;
        emitText(false);
      } else if (e.type === 'content_block_stop') {
        emitText(true);
        flush(true);
      } else if (e.type === 'message_start' && full) {
        send({ type: 'text', t: '\n' }); full += '\n';
      }
    }
  };

  child.stdout.on('data', d => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { onEvent(JSON.parse(line)); } catch {}
    }
  });
  let errTxt = '';
  child.stderr.on('data', d => { errTxt += d.toString('utf8'); });
  child.on('close', code => {
    if (current?.child === child) current = null;
    flush(true);
    log('done', code, JSON.stringify(full.slice(0, 300)), errTxt.slice(0, 300));
    audioChain.then(() => send({ type: 'done', code, err: code ? errTxt.slice(-400) : undefined }));
  });
}

// ---------- STT fallback (ElevenLabs Scribe) ----------
async function stt(audio, mime) {
  const key = env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set in .env');
  const fd = new FormData();
  fd.append('model_id', 'scribe_v1');
  if (STT_LANG) fd.append('language_code', STT_LANG);
  fd.append('file', new Blob([audio], { type: mime }), mime.includes('mp4') ? 'a.mp4' : 'a.webm');
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300));
  return j.text || '';
}

// ---------- http ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };

const readBody = req => new Promise((res, rej) => {
  const parts = []; let n = 0;
  req.on('data', c => { n += c.length; if (n > 25e6) { rej(new Error('too big')); req.destroy(); } else parts.push(c); });
  req.on('end', () => res(Buffer.concat(parts)));
  req.on('error', rej);
});

const authed = req => {
  const p = req.headers['x-pin'] || '';
  return p.length === PIN.length && crypto.timingSafeEqual(Buffer.from(p), Buffer.from(PIN));
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (p.startsWith('/api/')) {
      if (!authed(req)) return json(401, { error: 'pin' });
      if (p === '/api/ping') { const st = loadState(); return json(200, { ok: true, busy: !!current, session: st.sessionId || null, usage: st.usage || null, host: os.hostname(), speechLang: SPEECH_LANG }); }
      if (p === '/api/stop' && req.method === 'POST') { killJob(); return json(200, { ok: true }); }
      if (p === '/api/history') return json(200, { items: hist, busy: !!current });
      if (p === '/api/reset' && req.method === 'POST') { killJob(); hist = []; saveHist(true); const u = loadState().usage || {}; saveState({ usage: { five: u.five, week: u.week, win: u.win, model: u.model, effort: u.effort } }); return json(200, { ok: true }); }
      if (p === '/api/stt' && req.method === 'POST') {
        const text = await stt(await readBody(req), req.headers['content-type'] || 'audio/webm');
        return json(200, { text });
      }
      if (p === '/api/upload' && req.method === 'POST') {
        const orig = decodeURIComponent(req.headers['x-name'] || 'file');
        const ext = (path.extname(orig).toLowerCase().match(/^\.[a-z0-9]{1,8}$/) || [''])[0];
        const base = path.basename(orig, path.extname(orig)).replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '_').slice(0, 40) || 'file';
        const f = path.join(UP, crypto.randomBytes(4).toString('hex') + '_' + base + ext);
        // stream straight to disk, not RAM — phone videos can be up to 2 GB
        await new Promise((res, rej) => {
          const out = fs.createWriteStream(f); let n = 0;
          req.on('data', c => { n += c.length; if (n > 2e9) { req.destroy(); out.destroy(); fs.rm(f, () => {}); rej(new Error('too big')); } });
          req.on('error', rej); out.on('error', rej); out.on('finish', res);
          req.pipe(out);
        });
        log('upload', f);
        return json(200, { path: f, url: publishImage(f) });
      }
      if (p === '/api/ask' && req.method === 'POST') {
        let { text, files, thumbs } = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        thumbs = (Array.isArray(thumbs) ? thumbs : []).filter(u => /^\/img\/[0-9a-f]{24}\.\w+$/.test(u));
        const shown = (text || '').trim();
        files = (Array.isArray(files) ? files : []).filter(f => typeof f === 'string' && path.resolve(f).startsWith(UP + path.sep) && fs.existsSync(f));
        text = (text || '').trim() || (files.length ? 'Take a look at the attached files.' : '');
        if (!text) return json(400, { error: 'empty' });
        hist.push({ t: 'me', text: shown || '📎 ' + files.length, thumbs }); saveHist(true);
        if (files.length) text += '\n\n[The user attached ' + files.length + ' file(s); open them with Read: ' + files.join(' , ') + ']';
        killJob(); // a new request replaces the running one
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
        let open = true;
        req.on('close', () => { open = false; }); // phone disconnected: let the job keep running
        const send = o => { if (open) res.write(`data: ${JSON.stringify(o)}\n\n`); if (o.type === 'done' && open) res.end(); };
        const hb = setInterval(() => open ? res.write(': hb\n\n') : clearInterval(hb), 15000);
        return runClaude(text.trim(), o => { if (o.type === 'done') clearInterval(hb); recordEvent(o); send(o); });
      }
      return json(404, { error: 'nf' });
    }
    if (p.startsWith('/img/')) {
      const n = path.basename(p), f = path.join(TMP, n);
      if (!/^[0-9a-f]{24}\.(png|jpe?g|gif|webp|mp4|webm|mov)$/.test(n) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      // iOS refuses to play video without Range support
      const size = fs.statSync(f).size, type = IMG_EXT[path.extname(n)];
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (m) {
        const a = m[1] ? +m[1] : size - +m[2], b = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
        res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${size}`, 'accept-ranges': 'bytes', 'content-length': b - a + 1 });
        return fs.createReadStream(f, { start: a, end: b }).pipe(res);
      }
      res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
      return fs.createReadStream(f).pipe(res);
    }
    if (p.startsWith('/audio/')) {
      const f = path.join(TMP, path.basename(p));
      if (!/^[0-9a-f]{24}\.mp3$/.test(path.basename(p)) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' });
      return fs.createReadStream(f).pipe(res);
    }
    const f = path.join(ROOT, 'public', p === '/' ? 'index.html' : path.normalize(p).replace(/^([/\\])+/, ''));
    if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    log('err', e.stack);
    if (!res.headersSent) json(500, { error: e.message }); else res.end();
  }
}).listen(PORT, '127.0.0.1', () => { log('listening', PORT); console.log(`Claude Voice on http://127.0.0.1:${PORT}  (claude: ${CLAUDE})`); });

// delete audio older than 1 h, images/videos older than 30 days
setInterval(() => {
  for (const f of fs.readdirSync(TMP)) {
    const fp = path.join(TMP, f);
    const keep = IMG_EXT[path.extname(f).toLowerCase()] ? 30 * 86400e3 : 3600e3;
    try { if (Date.now() - fs.statSync(fp).mtimeMs > keep) fs.rmSync(fp); } catch {}
  }
}, 600e3);
