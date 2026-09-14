#!/usr/bin/env node
// Zstore AI — "One Ribbon". Zero-dependency static server for this folder.
// Usage:  node serve.cjs            -> http://localhost:5190/
//         node serve.cjs --open     -> same, and opens the default browser (START.cmd uses this)
//         PORT=5191 node serve.cjs  -> another port
// Listens on 127.0.0.1 only. Every response is sent with Cache-Control: no-store, so edits show on reload.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const ROOT = __dirname;
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 5190;
const OPEN = process.argv.includes('--open');
const URL_ = `http://localhost:${PORT}/`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function openBrowser(url) {
  if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', url], () => {});
  else execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], () => {});
}

function plain(res, status, text, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(text);
}

function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return plain(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return plain(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  let url, pathname;
  try {
    url = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
  } catch (e) {
    return plain(res, 400, 'Bad request');
  }
  if (pathname.includes('\0')) return plain(res, 400, 'Bad request');
  const file = path.normalize(path.join(ROOT, pathname));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return plain(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      if (!pathname.endsWith('/')) return plain(res, 301, 'Moved', { Location: url.pathname + '/' + url.search });
      return sendFile(req, res, path.join(file, 'index.html'));
    }
    sendFile(req, res, file);
  });
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') { console.error(err); process.exit(1); }
  // Port taken: if it is this site (for example START.cmd was double-clicked twice), just open it.
  http.get(URL_ + 'site.webmanifest', (r) => {
    let body = '';
    r.on('data', (d) => { body += d; });
    r.on('end', () => {
      if (body.includes('Zstore AI')) {
        console.log(`One Ribbon is already running at ${URL_}`);
        if (OPEN) openBrowser(URL_);
        process.exit(0);
      }
      console.error(`Port ${PORT} is used by another program. Start on another port, e.g.  set PORT=5191 && node serve.cjs`);
      process.exit(1);
    });
  }).on('error', () => {
    console.error(`Port ${PORT} is not available. Start on another port, e.g.  set PORT=5191 && node serve.cjs`);
    process.exit(1);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`One Ribbon (Zstore AI) is running at ${URL_}`);
  console.log('Press Ctrl+C (or close this window) to stop.');
  if (OPEN) openBrowser(URL_);
});
