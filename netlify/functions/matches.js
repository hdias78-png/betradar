exports.handler = async (event) => {
  const path = event.queryStringParameters?.path || "matches";
  const r = await fetch(`https://api.football-data.org/v4/${path}`, {
    headers: { "X-Auth-Token": "04b25e0b04144451abb6e47aed171ea4" }
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
};
