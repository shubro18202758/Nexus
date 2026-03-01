import { NextRequest } from "next/server";

async function tavilySearch(query: string, maxResults = 5) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { results: [], answer: "" };
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key, query, max_results: maxResults,
      search_depth: "advanced", include_answer: true,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return { results: [], answer: "" };
  return res.json();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(req.url);
  const clubName = searchParams.get("name") ?? "";
  const iitName = searchParams.get("iit") ?? "";

  if (!clubName) return Response.json({ articles: [], events: [] });

  const [newsData, eventData, competitionData] = await Promise.all([
    // Recent news/articles about the club
    tavilySearch(`"${clubName}" "${iitName}" 2024 2025 news update announcement project launch`, 5),
    // Upcoming events
    tavilySearch(`"${clubName}" "${iitName}" upcoming event hackathon workshop registration open 2025`, 4),
    // Competitions and challenges
    tavilySearch(`"${clubName}" "${iitName}" competition challenge quiz contest winners results`, 4),
  ]);

  // Structure articles
  const articles = newsData.results.map((r: { title: string; url: string; content: string; published_date?: string }) => ({
    title: r.title,
    url: r.url,
    summary: r.content.slice(0, 200) + "...",
    publishedDate: r.published_date ?? null,
    type: "news",
  }));

  // Structure events from both searches
  const rawEvents = [
    ...eventData.results.map((r: { title: string; url: string; content: string }) => ({ ...r, type: "event" })),
    ...competitionData.results.map((r: { title: string; url: string; content: string }) => ({ ...r, type: "competition" })),
  ];

  const events = rawEvents.map(r => ({
    title: r.title,
    url: r.url,
    summary: r.content.slice(0, 200) + "...",
    type: r.type,
  }));

  return Response.json({ articles, events, answer: newsData.answer ?? "" });
}
