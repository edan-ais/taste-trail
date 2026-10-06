# Taste Trail
An agent that turns a few favorites (artists, films, books, places) into a one-day itinerary in any city, plus a soundtrack, a watch and a read. Every pick comes from Qloo's Taste AI API, so the plan reflects cross-domain taste instead of generic top-10 lists.

Live demo: https://taste-trail-qloo.orange-smoke-b50e.workers.dev

## How the agent works
1. Resolves each favorite to a Qloo entity (Search API).
2. Plans four slots (morning, lunch, afternoon, evening). For each slot it calls the Insights API with the user's taste signals and a place category. If a category returns nothing new, it tries the next category for that slot and records the decision.
3. Calls Insights again for artists, movies and books for the cross-domain extras.
4. Shows a visible trace of every tool call and decision. "Not for me" rejects a stop and the agent re-plans around it.

Without Qloo there is nothing to plan from: all taste signal comes from the Qloo graph.

## Run locally
`QLOO_API_KEY=your_key node server.mjs` then open http://localhost:3000. Node 18+, no dependencies.

## Deploy
`worker.js` is a single Cloudflare Worker (static page plus API). Set `QLOO_API_KEY` as a Worker secret. The key never reaches the browser or this repo.

## License
MIT
