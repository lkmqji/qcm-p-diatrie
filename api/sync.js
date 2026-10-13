const https = require('https');

const DEFAULT_BINS = {
  'OUAIL-2026': 'cbdabdf'
};
const EXTENDSCLASS_API = 'https://extendsclass.com/api/json-storage/bin';

function httpsRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'PediaDrill-Vercel-Sync-Gateway/1.0'
    };
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: method,
      headers: headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: body }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// In Vercel serverless function (Node.js runtime)
export default async function handler(req, res) {
  // 1. Strict, clean W3C CORS headers (wildcard origin, NO credentials header)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Resolve session code and bin
  const code = (req.query?.code || 'OUAIL-2026').toString().toUpperCase().trim();
  const binId = DEFAULT_BINS[code] || 'cbdabdf';

  try {
    if (req.method === 'GET') {
      const response = await httpsRequest(`${EXTENDSCLASS_API}/${binId}?_t=${Date.now()}`);
      if (response.status >= 200 && response.status < 300) {
        let json;
        try {
          json = JSON.parse(response.body);
        } catch {
          json = {};
        }
        return res.status(200).json(json);
      } else {
        return res.status(response.status).json({ error: 'Remote store unavailable', status: response.status });
      }
    } else if (req.method === 'POST' || req.method === 'PUT') {
      let bodyData = req.body;
      if (typeof bodyData !== 'string') {
        bodyData = JSON.stringify(bodyData || {});
      }

      const putRes = await httpsRequest(`${EXTENDSCLASS_API}/${binId}`, 'PUT', bodyData);
      if (putRes.status >= 200 && putRes.status < 300) {
        return res.status(200).json({ success: true, timestamp: Date.now() });
      } else {
        return res.status(502).json({ error: 'Failed to write to remote store', status: putRes.status });
      }
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
