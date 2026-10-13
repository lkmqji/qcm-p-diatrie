// Vercel Serverless Function: /api/sync
// Ultra-fast, 100% CORS-compliant gateway for PédiaDrill multi-device sync

const DEFAULT_BINS = {
  'OUAIL-2026': 'cbdabdf'
};
const EXTENDSCLASS_API = 'https://extendsclass.com/api/json-storage/bin';

export default async function handler(req, res) {
  // 1. Clean W3C-compliant CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Resolve session code and cloud bin
  const code = (req.query?.code || 'OUAIL-2026').toString().toUpperCase().trim();
  const binId = DEFAULT_BINS[code] || 'cbdabdf';

  try {
    if (req.method === 'GET') {
      const response = await fetch(`${EXTENDSCLASS_API}/${binId}?_t=${Date.now()}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      if (response.ok) {
        const json = await response.json();
        return res.status(200).json(json);
      } else {
        return res.status(response.status).json({ error: 'Remote store unavailable', status: response.status });
      }
    } else if (req.method === 'POST' || req.method === 'PUT') {
      let bodyData = req.body;
      if (typeof bodyData !== 'string') {
        bodyData = JSON.stringify(bodyData || {});
      }

      const putRes = await fetch(`${EXTENDSCLASS_API}/${binId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        body: bodyData
      });

      if (putRes.ok) {
        return res.status(200).json({ success: true, timestamp: Date.now() });
      } else {
        return res.status(putRes.status).json({ error: 'Failed to write to remote store', status: putRes.status });
      }
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
