export default async function handler(req, res) {
  const path = req.query.path || "matches";
  const url = `https://api.football-data.org/v4/${path}`;
  try {
    const r = await fetch(url, {
      headers: { "X-Auth-Token": "04b25e0b04144451abb6e47aed171ea4" }
    });
    const data = await r.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(r.status).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
