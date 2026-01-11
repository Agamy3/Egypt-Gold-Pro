/**
 * US Macro Context API
 * 
 * Returns Federal Reserve data: Fed Funds Target Range and FOMC meeting schedule
 * GET /api/us/macro
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 2026 FOMC Meeting Schedule (from Federal Reserve official calendar)
// Format: { start: YYYY-MM-DD, end: YYYY-MM-DD, isSEP: boolean }
const FOMC_MEETINGS_2026 = [
  { start: '2026-01-27', end: '2026-01-28', isSEP: false },
  { start: '2026-03-17', end: '2026-03-18', isSEP: true },
  { start: '2026-04-28', end: '2026-04-29', isSEP: false },
  { start: '2026-06-16', end: '2026-06-17', isSEP: true },
  { start: '2026-07-28', end: '2026-07-29', isSEP: false },
  { start: '2026-09-15', end: '2026-09-16', isSEP: true },
  { start: '2026-10-27', end: '2026-10-28', isSEP: false },
  { start: '2026-12-08', end: '2026-12-09', isSEP: true },
];

// Current Fed Funds Target Range (hardcoded - TODO: fetch from Fed API or scrape)
const CURRENT_FED_FUNDS_TARGET = {
  lower: 3.5,
  upper: 3.75,
  unit: '%',
  source: 'Federal Reserve',
  sourceUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
  asOf: '2025-01-09', // TODO: Update with actual announcement date
};

function getNextFOMCMeetings(now: Date = new Date()) {
  const nowStr = now.toISOString().split('T')[0];
  
  // Find next meeting (end date in future)
  const upcoming = FOMC_MEETINGS_2026.filter(meeting => meeting.end >= nowStr);
  
  // Sort by start date
  upcoming.sort((a, b) => a.start.localeCompare(b.start));
  
  return upcoming;
}

function calculateDaysUntil(dateStr: string, now: Date = new Date()): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const nowDate = new Date(now);
  nowDate.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - nowDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export async function GET() {
  try {
    const now = new Date();
    const upcomingMeetings = getNextFOMCMeetings(now);
    
    if (upcomingMeetings.length === 0) {
      return NextResponse.json({
        asOf: now.toISOString(),
        fedFundsTargetRange: CURRENT_FED_FUNDS_TARGET,
        nextFomc: null,
        nextFomcList: [],
        daysUntilNextFomcEnd: null,
        error: 'No upcoming FOMC meetings found',
      });
    }

    const nextFomc = upcomingMeetings[0];
    const nextFomcList = upcomingMeetings.slice(0, 4); // Next 4 meetings
    const daysUntilNextFomcEnd = calculateDaysUntil(nextFomc.end, now);

    return NextResponse.json({
      asOf: now.toISOString(),
      fedFundsTargetRange: CURRENT_FED_FUNDS_TARGET,
      nextFomc: {
        start: nextFomc.start,
        end: nextFomc.end,
        isSEP: nextFomc.isSEP,
      },
      nextFomcList: nextFomcList.map(m => ({
        start: m.start,
        end: m.end,
        isSEP: m.isSEP,
      })),
      daysUntilNextFomcEnd,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('US Macro API error:', errorMessage);

    return NextResponse.json(
      {
        asOf: new Date().toISOString(),
        error: 'Failed to fetch macro data',
        errorMessage,
        fedFundsTargetRange: CURRENT_FED_FUNDS_TARGET,
        nextFomc: null,
        nextFomcList: [],
        daysUntilNextFomcEnd: null,
      },
      { status: 200 } // Always return 200, even on error
    );
  }
}

