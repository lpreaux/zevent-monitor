import { createServer } from 'node:http';
const UPSTREAM = 'https://zevent-api.lofgplv.fr';
createServer(async (req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  try {
    const up = await fetch(new URL(req.url, UPSTREAM), { headers: { accept: 'application/json' } });
    const body = await up.text();
    res.writeHead(up.status, { ...cors, 'content-type': up.headers.get('content-type') ?? 'application/json' });
    res.end(body);
  } catch (e) { res.writeHead(502, { ...cors }); res.end(String(e)); }
}).listen(8788, () => console.log('proxy ok'));
