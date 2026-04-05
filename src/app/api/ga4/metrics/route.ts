import { NextResponse } from "next/server";

// GA4 API integration not yet implemented.
// Returns empty data so the UI shows "Sem dados" instead of fake/seeded numbers.
export async function GET() {
  return NextResponse.json({
    timeSeries: [],
    totals: {
      sessions: 0, users: 0, newUsers: 0, pageviews: 0,
      engagedSessions: 0, events: 0, conversions: 0,
      engagementRate: 0, eventsPerSession: 0, pagesPerSession: 0, newUserRate: 0,
    },
    events: [],
    regions: [],
    channels: {},
    languages: [],
    demographics: { gender: [], age: [] },
  });
}
