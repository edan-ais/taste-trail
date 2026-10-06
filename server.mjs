// Taste Trail: tiny dependency-free proxy so the Qloo key stays server-side.
// Run: QLOO_API_KEY=... node server.mjs
import http from 'node:http'; import fs from 'node:fs';
const KEY = process.env.QLOO_API_KEY, BASE = process.env.QLOO_BASE || 'https://hackathon.api.qloo.com';
if (!KEY) { console.error('Set QLOO_API_KEY'); process.exit(1); }
const q = (path, params) => fetch(`${BASE}${path}?${new URLSearchParams(params)}`, { headers: { 'X-Api-Key': KEY } }).then(r => r.json());
const slim = e => ({ name: e.name, type: (e.types||[])[0]?.replace('urn:entity:','') || '', desc: e.properties?.description || '', address: e.properties?.address || '', tags: (e.tags||[]).slice(0,4).map(t=>t.name) });
const send = (res, code, body, type='application/json') => { res.writeHead(code, {'content-type': type}); res.end(typeof body==='string'?body:JSON.stringify(body)); };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/search') {
      const r = await q('/search', { query: u.searchParams.get('q')||'', take: 5 });
      return send(res, 200, (r.results||[]).map(e => ({ id: e.entity_id, name: e.name, type: (e.types||[])[0]?.replace('urn:entity:','') })));
    }
    if (u.pathname === '/api/trail') {
      const ids = (u.searchParams.get('ids')||'').split(',').filter(Boolean).slice(0,5).join(','), city = u.searchParams.get('city')||'';
      if (!ids || !city) return send(res, 400, { error: 'ids and city required' });
      const ins = (type, extra={}) => q('/v2/insights', { 'filter.type': `urn:entity:${type}`, 'signal.interests.entities': ids, take: 6, ...extra }).then(r => (r.results?.entities||[]).map(slim)).catch(()=>[]);
      const [places, artists, movies, books] = await Promise.all([
        ins('place', { 'filter.location.query': city }), ins('artist'), ins('movie'), ins('book')]);
      const slots = ['Morning', 'Lunch', 'Afternoon', 'Evening'];
      const seen = new Set(), uniq = places.filter(p => !seen.has(p.name) && seen.add(p.name));
      return send(res, 200, { city, stops: slots.map((s,i)=>({ slot: s, place: uniq[i]||null })), soundtrack: artists.slice(0,3), watch: movies.slice(0,2), read: books.slice(0,2) });
    }
    const file = u.pathname === '/' ? 'index.html' : u.pathname.slice(1).replace(/\.\./g,'');
    return send(res, 200, fs.readFileSync('public/'+file), file.endsWith('.html')?'text/html':'text/plain');
  } catch (e) { send(res, 500, { error: String(e.message||e) }); }
}).listen(process.env.PORT || 3000, () => console.log('Taste Trail on :'+(process.env.PORT||3000)));
