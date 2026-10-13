// Vercel Serverless Function: /api/sync
// Pure Vanilla Node.js - 100% framework-independent & CORS-compliant

const DEFAULT_BINS = {
  'OUAIL-2026': 'cbdabdf'
};
const EXTENDSCLASS_API = 'https://extendsclass.com/api/json-storage/bin';

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function getRawBody(req) {
  if (req.body) {
    return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

export default async function handler(req, res) {
  // 1. Clean W3C CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  // 2. Parse query parameters
  const urlObj = new URL(req.url, 'http://localhost');
  const codeParam = urlObj.searchParams.get('code') || req.query?.code || 'OUAIL-2026';
  const code = codeParam.toString().toUpperCase().trim();
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
        return sendJson(res, 200, json);
      } else {
        return sendJson(res, response.status, { error: 'Remote store unavailable' });
      }
    } else if (req.method === 'POST' || req.method === 'PUT') {
      const bodyData = await getRawBody(req);

      const putRes = await fetch(`${EXTENDSCLASS_API}/${binId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        body: bodyData || '{}'
      });

      if (putRes.ok) {
        return sendJson(res, 200, { success: true, timestamp: Date.now() });
      } else {
        return sendJson(res, putRes.status, { error: 'Failed to write to remote store' });
      }
    } else {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
}
