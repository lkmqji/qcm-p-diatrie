export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end('HELLO VERCEL API');
}
