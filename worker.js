// Taste Trail agent. Runs as a Cloudflare Worker (env.QLOO_API_KEY secret) or locally via server.mjs.
const BASE = 'https://hackathon.api.qloo.com';
const SLOTS = [
  { slot: 'Morning', tags: ['breakfast_restaurant', 'bakery', 'coffee'] },
  { slot: 'Lunch', tags: ['restaurant'] },
  { slot: 'Afternoon', tags: ['park', 'museum', 'art_gallery', 'bookstore', 'beach'] },
  { slot: 'Evening', tags: ['cocktail_bar', 'live_music_venue', 'bar'] },
];
const slim = e => ({ name: e.name, address: e.properties?.address || '', desc: e.properties?.description || '', tags: (e.tags || []).slice(0, 4).map(t => t.name) });

async function qloo(env, path, params, trace, label) {
  const r = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, { headers: { 'X-Api-Key': env.QLOO_API_KEY } });
  const j = await r.json().catch(() => ({}));
  const items = j.results?.entities || j.results || [];
  if (trace) trace.push({ tool: label, status: r.status, results: items.length });
  return items;
}

// Agent loop: resolve taste signals, then plan each slot by trying category tags in order, skipping rejected or repeated picks.
async function plan(env, ids, city, exclude) {
  const trace = [], used = new Set(exclude), signal = ids.join(',');
  const stops = [];
  for (const s of SLOTS) {
    let pick = null;
    for (const tag of s.tags) {
      const items = await qloo(env, '/v2/insights', { 'filter.type': 'urn:entity:place', 'filter.location.query': city, 'signal.interests.entities': signal, 'filter.tags': `urn:tag:category:place:${tag}`, take: 8 }, trace, `insights(place, ${tag}, ${city})`);
      pick = items.map(slim).find(p => !used.has(p.name));
      if (pick) { trace.push({ decide: `${s.slot}: ${pick.name} (via ${tag})` }); used.add(pick.name); break; }
      trace.push({ decide: `${s.slot}: nothing for ${tag}, trying next category` });
    }
    stops.push({ slot: s.slot, place: pick });
  }
  const more = type => qloo(env, '/v2/insights', { 'filter.type': `urn:entity:${type}`, 'signal.interests.entities': signal, take: 3 }, trace, `insights(${type})`).then(a => a.map(e => e.name));
  const [soundtrack, watch, read] = await Promise.all([more('artist'), more('movie'), more('book')]);
  return { city, stops, soundtrack, watch, read, trace };
}

const json = (b, c = 200) => new Response(JSON.stringify(b), { status: c, headers: { 'content-type': 'application/json' } });
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (!env.QLOO_API_KEY) return json({ error: 'server missing QLOO_API_KEY' }, 500);
    try {
      if (u.pathname === '/api/search') {
        const r = await fetch(`${BASE}/search?${new URLSearchParams({ query: u.searchParams.get('q') || '', take: 5 })}`, { headers: { 'X-Api-Key': env.QLOO_API_KEY } }).then(x => x.json());
        return json((r.results || []).map(e => ({ id: e.entity_id, name: e.name, type: (e.types || [])[0]?.replace('urn:entity:', '') })));
      }
      if (u.pathname === '/api/trail') {
        const ids = (u.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 5), city = (u.searchParams.get('city') || '').slice(0, 80);
        if (!ids.length || !city) return json({ error: 'ids and city required' }, 400);
        const exclude = (u.searchParams.get('exclude') || '').split('|').filter(Boolean);
        return json(await plan(env, ids, city, exclude));
      }
      return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    } catch (e) { return json({ error: String(e.message || e) }, 500); }
  },
};

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Taste Trail</title>
<style>body{font:16px system-ui;max-width:780px;margin:2rem auto;padding:0 1rem;color:#222}input{padding:.4rem;margin:.2rem}button{padding:.4rem .8rem}
.chip{display:inline-block;background:#eef;border-radius:1rem;padding:.2rem .7rem;margin:.15rem}.stop{border-left:4px solid #6a5acd;padding:.3rem .8rem;margin:.8rem 0}small,.tr{color:#666}.tr{font:12px monospace;white-space:pre-wrap;background:#f6f6f6;padding:.6rem}</style></head><body>
<h1>Taste Trail</h1><p>Tell the agent what you love (artists, films, books, places). It calls Qloo's taste graph to plan a day in any city, retries categories when a slot comes up empty, and lets you reject a stop to re-plan.</p>
<div><input id="q" placeholder="e.g. Radiohead"><button id="s">Add</button></div><div id="chips"></div>
<div><input id="city" placeholder="City, e.g. San Luis Obispo"><button id="go">Plan my day</button></div><div id="out"></div><h3>Agent trace</h3><div id="tr" class="tr"></div>
<script>
const picks=[],ex=[];const $=i=>document.getElementById(i);
const esc=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
$('s').onclick=async()=>{const r=await (await fetch('/api/search?q='+encodeURIComponent($('q').value))).json();if(r[0]){picks.push(r[0]);$('chips').innerHTML=picks.map(p=>'<span class="chip">'+esc(p.name)+' <small>'+esc(p.type)+'</small></span>').join('');$('q').value=''}};
async function run(){if(!picks.length||!$('city').value){$('out').textContent='Add at least one favorite and a city.';return}
$('out').textContent='Planning...';
const d=await (await fetch('/api/trail?city='+encodeURIComponent($('city').value)+'&ids='+picks.map(p=>p.id).join(',')+'&exclude='+encodeURIComponent(ex.join('|')))).json();
if(d.error){$('out').textContent=d.error;return}
const li=a=>(a||[]).map(esc).join(', ')||'none';
$('out').innerHTML=d.stops.map(s=>'<div class="stop"><b>'+s.slot+'</b>: '+(s.place?esc(s.place.name)+' <button data-n="'+esc(s.place.name)+'">Not for me</button><br><small>'+esc(s.place.address)+' '+s.place.tags.map(esc).join(' / ')+'</small>':'no match')+'</div>').join('')+'<p><b>Soundtrack:</b> '+li(d.soundtrack)+'<br><b>Watch tonight:</b> '+li(d.watch)+'<br><b>Read:</b> '+li(d.read)+'</p>';
$('tr').textContent=d.trace.map(t=>t.tool?'CALL '+t.tool+' -> '+t.status+', '+t.results+' results':'THINK '+t.decide).join('\\n');
document.querySelectorAll('button[data-n]').forEach(b=>b.onclick=()=>{ex.push(b.dataset.n);run()})}
$('go').onclick=run;
</script></body></html>`;
