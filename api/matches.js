const API_KEY = "04b25e0b04144451abb6e47aed171ea4";
const BASE_URL = "https://api.football-data.org/v4";

const LEAGUES_EUROPE = [
  { name: "Premier League", id: 2021, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { name: "Ligue 1",        id: 2015, flag: "🇫🇷" },
  { name: "Bundesliga",     id: 2002, flag: "🇩🇪" },
  { name: "La Liga",        id: 2014, flag: "🇪🇸" },
  { name: "Liga NOS",       id: 2017, flag: "🇵🇹" },
  { name: "Serie A",        id: 2019, flag: "🇮🇹" }
];

const LEAGUE_CHINA = { name: "Super League", id: 2003, flag: "🇨🇳" };

const RSS_SOURCES = [
  { name: "L'Equipe",  url: "https://www.lequipe.fr/rss/actu_rss_Football.xml", lang: "fr" },
  { name: "A Bola",    url: "https://www.abola.pt/rss/index.aspx",              lang: "pt" },
  { name: "Gazzetta",  url: "https://www.gazzetta.it/rss/calcio.xml",           lang: "it" }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function apiGet(path) {
  await sleep(350);
  const res = await fetch(`${BASE_URL}/${path}`, {
    headers: { "X-Auth-Token": API_KEY }
  });
  if (!res.ok) return null;
  return res.json();
}

async function getTeamForm(teamId) {
  const data = await apiGet(`teams/${teamId}/matches?status=FINISHED&limit=6`);
  if (!data?.matches?.length) return { form: [], goalsScored: 0, goalsConceded: 0, matchCount: 0 };
  const matches = data.matches.slice(-6);
  const form = [];
  let goalsScored = 0, goalsConceded = 0;
  for (const m of matches) {
    const isHome = m.homeTeam.id === teamId;
    const gF = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const gA = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    goalsScored += gF;
    goalsConceded += gA;
    form.push(gF > gA ? "V" : gF === gA ? "N" : "D");
  }
  return { form, goalsScored, goalsConceded, matchCount: matches.length };
}

function calcPoissonUnder(lambda, maxGoals) {
  let prob = 0, fact = 1;
  for (let k = 0; k <= maxGoals; k++) {
    if (k > 0) fact *= k;
    prob += (Math.pow(lambda, k) * Math.exp(-lambda)) / fact;
  }
  return Math.min(99, Math.round(prob * 100));
}

function calcProbabilities(homeForm, awayForm) {
  const homeAvg = homeForm.matchCount ? homeForm.goalsScored / homeForm.matchCount : 1.5;
  const awayAvg = awayForm.matchCount ? awayForm.goalsScored / awayForm.matchCount : 1.2;
  const totalAvg = homeAvg + awayAvg;
  const over05  = Math.min(99, Math.round((1 - Math.exp(-totalAvg)) * 100));
  const over15  = Math.min(99, Math.round((1 - calcPoissonUnder(totalAvg, 1) / 100) * 100));
  const under35 = calcPoissonUnder(totalAvg, 3);
  return { over05, over15, under35 };
}

async function getMatches(leagues, maxPerLeague) {
  const today = new Date().toISOString().split("T")[0];
  const results = [];
  for (const league of leagues) {
    const data = await apiGet(
      `competitions/${league.id}/matches?dateFrom=${today}&dateTo=${today}&status=SCHEDULED`
    );
    if (!data?.matches?.length) continue;
    for (const m of data.matches.slice(0, maxPerLeague)) {
      const homeForm = await getTeamForm(m.homeTeam.id);
      const awayForm = await getTeamForm(m.awayTeam.id);
      const { over05, over15, under35 } = calcProbabilities(homeForm, awayForm);
      results.push({
        league: `${league.flag} ${league.name}`,
        homeTeam: m.homeTeam.name,
        awayTeam: m.awayTeam.name,
        utcDate: m.utcDate,
        home: { form: homeForm.form, goalsScored: homeForm.goalsScored, goalsConceded: homeForm.goalsConceded },
        away: { form: awayForm.form, goalsScored: awayForm.goalsScored, goalsConceded: awayForm.goalsConceded },
        over05,
        over15,
        under35,
        over05Badge:  over05  >= 93 ? "🔥 SURE" : over05  >= 85 ? "✅ BON" : "⚠️ OK",
        over15Badge:  over15  >= 88 ? "🔥 SURE" : over15  >= 76 ? "✅ BON" : "⚠️ OK",
        under35Badge: under35 >= 90 ? "🔥 SURE" : under35 >= 80 ? "✅ BON" : "⚠️ OK"
      });
    }
  }
  return results;
}

async function translateText(text, fromLang) {
  if (fromLang === "fr") return text;
  try {
    const encoded = encodeURIComponent(text.slice(0, 400));
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${fromLang}|fr`
    );
    const d = await r.json();
    return d?.responseData?.translatedText || text;
  } catch {
    return text;
  }
}

async function fetchRSS(source) {
  try {
    const r = await fetch(source.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; 4Kbet/1.0)" }
    });
    const xml = await r.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    let count = 0;
    while ((match = itemRegex.exec(xml)) !== null && count < 5) {
      const block = match[1];
      const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                     block.match(/<title>(.*?)<\/title>/))?.[1]?.trim() || "";
      const link  = (block.match(/<link>(.*?)<\/link>/) ||
                     block.match(/<link\s+href="(.*?)"/))?.[1]?.trim() || "#";
      const desc  = (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                     block.match(/<description>(.*?)<\/description>/))?.[1]
                     ?.replace(/<[^>]+>/g, "")?.trim()?.slice(0, 200) || "";
      const pub   = (block.match(/<pubDate>(.*?)<\/pubDate>/))?.[1]?.trim() || "";
      if (!title) continue;

      const titleFr = await translateText(title, source.lang);
      const descFr  = await translateText(desc,  source.lang);

      items.push({ source: source.name, title: titleFr, link, desc: descFr, pub });
      count++;
    }
    return items;
  } catch (e) {
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const path = req.query.path || "matches";

  // Route news RSS
  if (path === "news") {
    try {
      const allNews = [];
      for (const source of RSS_SOURCES) {
        const items = await fetchRSS(source);
        allNews.push(...items);
      }
      return res.status(200).json({ articles: allNews });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Route D1 Chine
  if (path === "china-matches") {
    try {
      const matches = await getMatches([LEAGUE_CHINA], 5);
      const filtered = matches.filter(m => m.over15 >= 70);
      filtered.sort((a, b) => b.over15 - a.over15);
      const today = new Date().toISOString().split("T")[0];
      return res.status(200).json({ date: today, matches: filtered });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Route Europe 6 championnats
  if (path === "europe-matches") {
    try {
      const matches = await getMatches(LEAGUES_EUROPE, 3);
      const filtered = matches.filter(m => m.over05 >= 80 || m.under35 >= 80);
      filtered.sort((a, b) => b.over05 - a.over05);
      const today = new Date().toISOString().split("T")[0];
      return res.status(200).json({ date: today, matches: filtered });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Route smart-matches (onglet Paris du jour — tous championnats)
  if (path === "smart-matches") {
    try {
      const today = new Date().toISOString().split("T")[0];
      const matches = await getMatches(LEAGUES_EUROPE, 3);
      const filtered = matches.filter(m => m.over05 >= 80 && m.under35 >= 80);
      filtered.sort((a, b) => b.over05 - a.over05);
      return res.status(200).json({ date: today, matches: filtered });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Route generique pass-through
  try {
    const r = await fetch(`${BASE_URL}/${path}`, {
      headers: { "X-Auth-Token": API_KEY }
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
