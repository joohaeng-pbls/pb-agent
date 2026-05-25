import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = '/workspace/extra/repos/pebblous.github.io';
const PORT = 8149;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const filePath = path.join(BASE, pathname === '/' ? 'index.html' : pathname);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end('404 Not Found: ' + pathname);
  }

  const mime = MIME[path.extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
}).listen(PORT, () => {
  console.log('Server ready on port ' + PORT);
});
