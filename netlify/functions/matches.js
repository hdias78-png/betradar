const API_KEY = "04b25e0b04144451abb6e47aed171ea4";
const BASE_URL = "https://api.football-data.org/v4";

const LEAGUES = {
  PL:  { name: "Premier League",   id: 2021 },
  FL1: { name: "Ligue 1",          id: 2015 },
  BL1: { name: "Bundesliga",       id: 2002 },
  PD:  { name: "La Liga",          id: 2014 },
  PPL: { name: "Liga NOS",         id: 2017 },
  SA:  { name: "Serie A",          id: 2019 },
  CL:  { name: "Champions League", id: 2001 }
};

const WC_TEAMS = [773, 760, 765, 759, 770, 762, 764, 1031, 907, 769, 768, 771];

async function apiGet(path) {
  const res = await fetch(`${BASE_URL}/${path}`, {
    headers: { "X-Auth-Token": API_KEY }
  });
  if (!res.ok) return null;
  return res.json();
}

async function getLastSixMatches(teamId) {
  const data = await apiGet(`teams/${teamId}/matches?status=FINISHED&limit=6`);
  if (!data || !data.matches) return [];
  return data.matches.slice(-6);
}

function calcOver05Score(matches, teamId) {
  if (!matches.length) return 0.5;
  let scored = 0;
  for (const m of matches) {
    const isHome = m.homeTeam.id === teamId;
    const goals = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    if (goals > 0) scored++;
  }
  return scored / matches.length;
}

function calcMatchProbability(homeMatches, awayMatches, homeId, awayId) {
  const homeScore = calcOver05Score(homeMatches, homeId);
  const awayScore = calcOver05Score(awayMatches, awayId);
  const prob = 1 - ((1 - homeScore) * (1 - awayScore));
  return Math.round(prob * 100);
}

async function getTodayMatches() {
  const today = new Date().toISOString().split("T")[0];

  const leagueEntries = Object.entries(LEAGUES);
  const leagueResults = await Promise.all(
    leagueEntries.map(([code, league]) =>
      apiGet(`competitions/${league.id}/matches?dateFrom=${today}&dateTo=${today}&status=SCHEDULED`)
        .then(data => ({ code, league, matches: data?.matches || [] }))
        .catch(() => ({ code, league, matches: [] }))
    )
  );

  const allRawMatches = [];
  for (const { code, league, matches } of leagueResults) {
    for (const m of matches) {
      allRawMatches.push({ ...m, leagueCode: code, leagueName: league.name });
    }
  }

  if (!allRawMatches.length) return [];

  const scored = await Promise.all(
    allRawMatches.map(async (m) => {
      const [homeMatches, awayMatches] = await Promise.all([
        getLastSixMatches(m.homeTeam.id),
        getLastSixMatches(m.awayTeam.id)
      ]);
      const probability = calcMatchProbability(
        homeMatches, awayMatches,
        m.homeTeam.id, m.awayTeam.id
      );
      const homeScored = calcOver05Score(homeMatches, m.homeTeam.id);
      const awayScored = calcOver05Score(awayMatches, m.awayTeam.id);
      return {
        id: m.id,
        league: m.leagueName,
        leagueCode: m.leagueCode,
        utcDate: m.utcDate,
        homeTeam: m.homeTeam.name,
        awayTeam: m.awayTeam.name,
        probability,
        homeForm: `${Math.round(homeScored * 6)}/6`,
        awayForm: `${Math.round(awayScored * 6)}/6`,
        market: probability >= 90 ? "Over 0.5" : probability >= 75 ? "Over 1.5" : "Skip"
      };
    })
  );

  return scored
    .filter(m => m.market !== "Skip")
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 12);
}

function isWorldCupPeriod() {
  const now = new Date();
  const wcStart = new Date("2026-06-11");
  const wcEnd = new Date("2026-07-19");
  return now >= wcStart && now <= wcEnd;
}

exports.handler = async (event) => {
  const path = event.queryStringParameters?.path;

  if (path && path !== "smart-matches") {
    const r = await fetch(`${BASE_URL}/${path}`, {
      headers: { "X-Auth-Token": API_KEY }
    });
    const data = await r.json();
    return {
      statusCode: r.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    };
  }

  try {
    const worldCup = isWorldCupPeriod();
    const matches = await getTodayMatches();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mode: worldCup ? "world_cup" : "leagues",
        date: new Date().toISOString().split("T")[0],
        totalFound: matches.length,
        matches
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
