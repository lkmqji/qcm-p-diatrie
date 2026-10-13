export const config = {
  runtime: 'edge',
};

const DEFAULT_BINS = {
  'OUAIL-2026': 'cbdabdf'
};
const EXTENDSCLASS_API = 'https://extendsclass.com/api/json-storage/bin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  let code = 'OUAIL-2026';
  try {
    const url = new URL(req.url);
    code = (url.searchParams.get('code') || 'OUAIL-2026').toUpperCase().trim();
  } catch {
    code = 'OUAIL-2026';
  }
  const binId = DEFAULT_BINS[code] || 'cbdabdf';

  try {
    if (req.method === 'GET') {
      const response = await fetch(`${EXTENDSCLASS_API}/${binId}?_t=${Date.now()}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
      });

      const data = await response.text();
      return new Response(data, {
        status: response.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await req.text();
      const putRes = await fetch(`${EXTENDSCLASS_API}/${binId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        body: body || '{}',
      });

      return new Response(JSON.stringify({
        success: putRes.ok,
        status: putRes.status,
        timestamp: Date.now()
      }), {
        status: putRes.ok ? 200 : putRes.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
}
