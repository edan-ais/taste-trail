// Local runner: QLOO_API_KEY=... node server.mjs  (production uses Cloudflare Workers with worker.js)
import http from 'node:http';
import worker from './worker.js';
const env = { QLOO_API_KEY: process.env.QLOO_API_KEY };
if (!env.QLOO_API_KEY) { console.error('Set QLOO_API_KEY'); process.exit(1); }
const port = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  const r = await worker.fetch(new Request('http://localhost:' + port + req.url), env);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log('Taste Trail on :' + port));
