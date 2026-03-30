import { NextRequest, NextResponse } from "next/server";

function seedRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296;
  };
}

function buildTimeSeries(days: number) {
  const series = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const rand = seedRand(d.getDate() * 211 + d.getMonth() * 53 + days);
    const weekday = d.getDay();
    const weekMult = weekday === 0 || weekday === 6 ? 0.65 : 1;
    const sessions = Math.round((800 + rand() * 600) * weekMult);
    const users = Math.round(sessions * (0.75 + rand() * 0.1));
    const newUsers = Math.round(users * (0.55 + rand() * 0.15));
    const pageviews = Math.round(sessions * (3.5 + rand() * 2));
    const engagedSessions = Math.round(sessions * (0.65 + rand() * 0.15));
    const events = Math.round(sessions * (4 + rand() * 2));
    const conversions = Math.round(sessions * (0.02 + rand() * 0.015));
    series.push({ date: dateStr, sessions, users, newUsers, pageviews, engagedSessions, events, conversions });
  }
  return series;
}

const EVENT_LIST = [
  { event: "session_start", isConversion: false },
  { event: "page_view", isConversion: false },
  { event: "first_visit", isConversion: false },
  { event: "scroll", isConversion: false },
  { event: "click", isConversion: false },
  { event: "generate_lead", isConversion: true },
  { event: "purchase", isConversion: true },
  { event: "contact_click", isConversion: true },
  { event: "form_submit", isConversion: true },
  { event: "add_to_cart", isConversion: false },
];

function buildEvents(days: number) {
  return EVENT_LIST.map((e, idx) => {
    const rand = seedRand(idx * 79 + days * 17);
    const base = idx < 3 ? 10000 : idx < 6 ? 2000 : 500;
    const count = Math.round((base + rand() * base * 0.5) * (days / 30));
    const sessions = Math.round(count * 0.4);
    const convRate = e.isConversion ? `${(2 + rand() * 8).toFixed(1)}%` : "0%";
    return { event: e.event, count, sessions, conversion: convRate };
  }).sort((a, b) => b.count - a.count);
}

const REGION_LIST = [
  "São Paulo", "Rio de Janeiro", "Minas Gerais", "Paraná",
  "Rio Grande do Sul", "Bahia", "Santa Catarina", "Goiás", "Pernambuco",
];

function buildRegions(days: number) {
  return REGION_LIST.map((name, idx) => {
    const rand = seedRand(idx * 61 + days * 11);
    const base = idx === 0 ? 12000 : idx === 1 ? 8000 : 3000 - idx * 200;
    const value = Math.round((base + rand() * base * 0.3) * (days / 30));
    return { name, value };
  }).sort((a, b) => b.value - a.value);
}

function buildDemographics(days: number) {
  const gender = [
    { label: "Masculino", impressions: 3800 * (days / 30), clicks: 0 },
    { label: "Feminino", impressions: 4200 * (days / 30), clicks: 0 },
    { label: "Desconhecido", impressions: 500 * (days / 30), clicks: 0 },
  ];
  const age = [
    { label: "18-24", impressions: 1000 * (days / 30), clicks: 0 },
    { label: "25-34", impressions: 2500 * (days / 30), clicks: 0 },
    { label: "35-44", impressions: 2100 * (days / 30), clicks: 0 },
    { label: "45-54", impressions: 1500 * (days / 30), clicks: 0 },
    { label: "55-64", impressions: 900 * (days / 30), clicks: 0 },
    { label: "65+", impressions: 500 * (days / 30), clicks: 0 },
  ];
  return { gender, age };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "30");

  const timeSeries = buildTimeSeries(days);
  const events = buildEvents(days);
  const regions = buildRegions(days);
  const demographics = buildDemographics(days);

  const totals = timeSeries.reduce(
    (acc, d) => ({
      sessions: acc.sessions + d.sessions,
      users: acc.users + d.users,
      newUsers: acc.newUsers + d.newUsers,
      pageviews: acc.pageviews + d.pageviews,
      engagedSessions: acc.engagedSessions + d.engagedSessions,
      events: acc.events + d.events,
      conversions: acc.conversions + d.conversions,
    }),
    { sessions: 0, users: 0, newUsers: 0, pageviews: 0, engagedSessions: 0, events: 0, conversions: 0 }
  );

  const enrichedTotals = {
    ...totals,
    engagementRate: totals.sessions > 0
      ? Math.round((totals.engagedSessions / totals.sessions) * 1000) / 10
      : 0,
    eventsPerSession: totals.sessions > 0
      ? Math.round((totals.events / totals.sessions) * 100) / 100
      : 0,
    pagesPerSession: totals.sessions > 0
      ? Math.round((totals.pageviews / totals.sessions) * 100) / 100
      : 0,
    newUserRate: totals.users > 0
      ? Math.round((totals.newUsers / totals.users) * 1000) / 10
      : 0,
  };

  const channels = {
    organic: { label: "Organic Search", value: 45, color: "#0ea5e9" },
    direct: { label: "Direct", value: 30, color: "#3b82f6" },
    social: { label: "Social", value: 15, color: "#2563eb" },
    paid: { label: "Paid Search", value: 10, color: "#1e40af" },
  };

  const languages = [
    { label: "pt-br", value: 92, color: "#0ea5e9" },
    { label: "en-us", value: 5, color: "#3b82f6" },
    { label: "es-es", value: 3, color: "#1e40af" },
  ];

  return NextResponse.json({ timeSeries, totals: enrichedTotals, events, regions, channels, languages, demographics });
}
