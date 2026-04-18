const API_KEY = "04b25e0b04144451abb6e47aed171ea4";
const BASE_URL = "https://api.football-data.org/v4";

const LEAGUES = [
  { name: "Premier League",   id: 2021, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { name: "Ligue 1",          id: 2015, flag: "🇫🇷" },
  { name: "Bundesliga",       id: 2002, flag: "🇩🇪" },
  { name: "La Liga",          id: 2014, flag: "🇪🇸" },
  { name: "Liga NOS",         id: 2017, flag: "🇵🇹" },
  { name: "Serie A",          id: 2019, flag: "🇮🇹" }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function apiGet(path) {
  await sleep(400);
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
  let goalsScored = 0;
  let goalsConceded = 0;

  for (const m of matches) {
    const isHome = m.homeTeam.id === teamId;
    const gF = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const gA = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    goalsScored += gF;
    goalsConceded += gA;
    if (gF > gA) form.push("V");
    else if (gF === gA) form.push("N");
    else form.push("D");
  }

  return { form, goalsScored, goalsConceded, matchCount: matches.length };
}

function calcPoissonUnder(lambda, maxGoals) {
  let prob = 0;
  let fact = 1;
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

  const over05 = Math.min(99, Math.round((1 - Math.exp(-totalAvg)) * 100));
  const under35 = calcPoissonUnder(totalAvg, 3);

  return { over05, under35 };
}

function formEmoji(form) {
  return form.map(r => r === "V" ? "🟢" : r === "N" ? "🟡" : "🔴").join(" ");
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
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const results = [];

    for (const league of LEAGUES) {
      const data = await apiGet(
        `competitions/${league.id}/matches?dateFrom=${today}&dateTo=${today}&status=SCHEDULED`
      );
      if (!data?.matches?.length) continue;

      for (const m of data.matches.slice(0, 3)) {
        const homeForm = await getTeamForm(m.homeTeam.id);
        const awayForm = await getTeamForm(m.awayTeam.id);
        const { over05, under35 } = calcProbabilities(homeForm, awayForm);

        if (over05 < 80 && under35 < 80) continue;

        results.push({
          league: `${league.flag} ${league.name}`,
          homeTeam: m.homeTeam.name,
          awayTeam: m.awayTeam.name,
          utcDate: m.utcDate,
          home: {
            form: homeForm.form,
            formEmoji: formEmoji(homeForm.form),
            goalsScored: homeForm.goalsScored,
            goalsConceded: homeForm.goalsConceded
          },
          away: {
            form: awayForm.form,
            formEmoji: formEmoji(awayForm.form),
            goalsScored: awayForm.goalsScored,
            goalsConceded: awayForm.goalsConceded
          },
          over05,
          under35,
          over05Badge:  over05  >= 93 ? "🔥 SURE"  : over05  >= 85 ? "✅ BON" : "⚠️ OK",
          under35Badge: under35 >= 90 ? "🔥 SURE"  : under35 >= 80 ? "✅ BON" : "⚠️ OK"
        });
      }
    }

    results.sort((a, b) => b.over05 - a.over05);

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, matches: results })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
