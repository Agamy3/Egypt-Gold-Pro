/**
 * Geopolitical Risk Detection Service
 * 
 * Event-driven detection of wars, conflicts, and geopolitical events that affect gold.
 * This is NOT volatility-driven - it's based on actual events in the news.
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type GeopoliticalRiskLevel = 'calm' | 'elevated' | 'volatile' | 'crisis';

export type GeopoliticalEvent = {
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'war' | 'conflict' | 'airstrike' | 'missile' | 'sanctions' | 'crisis' | 'instability' | 'other';
  title: string;
  source: string;
  publishedAt: string;
  countries: string[];
  description?: string;
};

export type GeopoliticalRiskAssessment = {
  riskLevel: GeopoliticalRiskLevel;
  events: GeopoliticalEvent[];
  triggeredEvents: GeopoliticalEvent[];
  reason: string;
  lastChecked: string;
};

/** Subset of `gold_signal_state.meta` used for geopolitical cache reads. */
type CachedGeopoliticalMeta = {
  geopoliticalRisk?: GeopoliticalRiskAssessment;
  geopoliticalRiskLastChecked?: string;
};

// High-severity keywords that indicate active conflict
const WAR_KEYWORDS = [
  // Active military actions
  'war', 'warfare', 'battle', 'combat', 'military operation', 'offensive', 'invasion',
  'airstrike', 'airstrikes', 'bombing', 'bombed', 'missile strike', 'missile attack',
  'drone strike', 'drone attack', 'artillery', 'shelling', 'bombardment',
  
  // Escalation terms
  'escalation', 'escalated', 'escalating', 'retaliation', 'retaliatory',
  'strike back', 'counterattack', 'response', 'response to',
  
  // Conflict declarations
  'declares war', 'war declared', 'state of war', 'at war',
  'military action', 'armed conflict', 'hostilities',
  
  // Regional powers involved
  'iran', 'israel', 'russia', 'ukraine', 'china', 'taiwan', 'north korea',
  'united states', 'usa', 'us military', 'nato', 'european union',
  
  // Middle East specific
  'gaza', 'west bank', 'hezbollah', 'houthi', 'yemen', 'syria', 'iraq',
  'lebanon', 'jordan', 'saudi arabia', 'uae', 'qatar',
  
  // Critical actions
  'nuclear', 'chemical weapons', 'biological weapons', 'weapons of mass destruction',
  'embassy attack', 'consulate attack', 'diplomatic crisis',
];

// Medium-severity keywords for elevated tensions
const TENSION_KEYWORDS = [
  'tension', 'tensions', 'standoff', 'confrontation', 'threat', 'threatened',
  'sanctions', 'sanctioned', 'embargo', 'trade war', 'economic war',
  'military buildup', 'troop movement', 'deployment', 'mobilization',
  'border dispute', 'territorial dispute', 'ceasefire violation',
  'diplomatic crisis', 'diplomatic breakdown', 'expel ambassador',
];

// Countries/regions that are major gold market movers
const MAJOR_POWERS = [
  'iran', 'israel', 'russia', 'ukraine', 'china', 'taiwan', 'north korea',
  'united states', 'usa', 'us', 'america', 'britain', 'uk', 'france',
  'germany', 'japan', 'india', 'pakistan', 'turkey', 'saudi arabia',
  'egypt', 'uae', 'qatar', 'kuwait', 'oman', 'jordan', 'lebanon',
  'syria', 'iraq', 'yemen', 'libya', 'afghanistan',
];

function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

function containsKeywords(text: string, keywords: string[]): boolean {
  const normalized = normalizeText(text);
  return keywords.some(keyword => normalized.includes(keyword));
}

function extractCountries(text: string): string[] {
  const normalized = normalizeText(text);
  const found: string[] = [];
  
  for (const country of MAJOR_POWERS) {
    if (normalized.includes(country)) {
      found.push(country);
    }
  }
  
  return found;
}

function classifyEventSeverity(title: string, summary?: string | null): 'low' | 'medium' | 'high' | 'critical' {
  const text = `${title} ${summary || ''}`.toLowerCase();
  
  // Critical: Active war, major military action, nuclear threats
  if (
    containsKeywords(text, ['war', 'warfare', 'invasion', 'declares war', 'at war']) ||
    containsKeywords(text, ['nuclear', 'chemical weapons', 'biological weapons']) ||
    containsKeywords(text, ['airstrike', 'missile strike', 'drone strike']) && containsKeywords(text, MAJOR_POWERS)
  ) {
    return 'critical';
  }
  
  // High: Military actions, escalations, major conflicts
  if (
    containsKeywords(text, ['airstrike', 'bombing', 'missile', 'drone strike', 'artillery', 'shelling']) ||
    containsKeywords(text, ['escalation', 'retaliation', 'counterattack']) ||
    containsKeywords(text, ['military operation', 'armed conflict', 'hostilities'])
  ) {
    return 'high';
  }
  
  // Medium: Tensions, sanctions, threats
  if (
    containsKeywords(text, TENSION_KEYWORDS) ||
    containsKeywords(text, ['sanctions', 'embargo', 'trade war'])
  ) {
    return 'medium';
  }
  
  return 'low';
}

function classifyEventType(title: string, summary?: string | null): GeopoliticalEvent['type'] {
  const text = `${title} ${summary || ''}`.toLowerCase();
  
  if (containsKeywords(text, ['war', 'warfare', 'invasion', 'at war'])) return 'war';
  if (containsKeywords(text, ['airstrike', 'bombing', 'missile strike', 'drone strike'])) return 'airstrike';
  if (containsKeywords(text, ['missile', 'rocket', 'ballistic'])) return 'missile';
  if (containsKeywords(text, ['sanctions', 'embargo'])) return 'sanctions';
  if (containsKeywords(text, ['crisis', 'emergency', 'alert'])) return 'crisis';
  if (containsKeywords(text, ['coup', 'instability', 'unrest', 'protest'])) return 'instability';
  if (containsKeywords(text, ['conflict', 'tension', 'standoff'])) return 'conflict';
  
  return 'other';
}

/**
 * Analyze news items for geopolitical risk events for a specific country
 * @param country - Country code (EG, AE, SA, US, GLOBAL) - defaults to GLOBAL
 */
export async function analyzeGeopoliticalRisk(
  supabase: SupabaseClient,
  hoursBack: number = 48,
  country: 'GLOBAL' | 'EG' | 'AE' | 'SA' | 'US' = 'GLOBAL'
): Promise<GeopoliticalRiskAssessment> {
  const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  
  // For local markets, prioritize local news but also include GLOBAL news
  // For GLOBAL, use all major country feeds
  const countriesToFetch = country === 'GLOBAL' 
    ? ['GLOBAL', 'EG', 'US', 'AE', 'SA']
    : [country, 'GLOBAL']; // Local market + global context
  
  // Fetch recent news from country-specific feeds
  const { data: newsItems, error } = await supabase
    .from('news_items')
    .select('title, summary, source, published_at, country, url')
    .in('country', countriesToFetch)
    .gte('published_at', cutoffDate)
    .order('published_at', { ascending: false })
    .limit(200); // Get enough items to analyze
  
  // Prioritize local news for local markets
  const sortedItems = country !== 'GLOBAL' 
    ? (newsItems || []).sort((a, b) => {
        // Local news first, then global
        if (a.country === country && b.country !== country) return -1;
        if (a.country !== country && b.country === country) return 1;
        return 0;
      })
    : (newsItems || []);
  
  if (error) {
    console.error('[GeopoliticalRisk] Error fetching news:', error);
    return {
      riskLevel: 'elevated', // Conservative default on error
      events: [],
      triggeredEvents: [],
      reason: 'error_fetching_news',
      lastChecked: new Date().toISOString(),
    };
  }
  
  const events: GeopoliticalEvent[] = [];
  const triggeredEvents: GeopoliticalEvent[] = [];
  
  // Analyze each news item
  for (const item of sortedItems) {
    const title = String(item.title || '').trim();
    if (!title) continue;
    
    const summary = item.summary ? String(item.summary).trim() : null;
    const text = `${title} ${summary || ''}`;
    
    // Check if this news item contains geopolitical risk indicators
    const hasWarKeywords = containsKeywords(text, WAR_KEYWORDS);
    const hasTensionKeywords = containsKeywords(text, TENSION_KEYWORDS);
    
    if (!hasWarKeywords && !hasTensionKeywords) continue;
    
    const severity = classifyEventSeverity(title, summary);
    const type = classifyEventType(title, summary);
    const countries = extractCountries(text);
    
    const event: GeopoliticalEvent = {
      severity,
      type,
      title,
      source: String(item.source || 'unknown'),
      publishedAt: String(item.published_at || new Date().toISOString()),
      countries,
      description: summary || undefined,
    };
    
    events.push(event);
    
    // Only trigger on high/critical severity events
    if (severity === 'high' || severity === 'critical') {
      triggeredEvents.push(event);
    }
  }
  
  // Determine risk level based on triggered events
  let riskLevel: GeopoliticalRiskLevel = 'calm';
  let reason = 'No significant geopolitical events detected';
  
  const criticalCount = triggeredEvents.filter(e => e.severity === 'critical').length;
  const highCount = triggeredEvents.filter(e => e.severity === 'high').length;
  
  if (criticalCount > 0) {
    riskLevel = 'crisis';
    reason = `${criticalCount} critical event(s) detected: ${triggeredEvents.slice(0, 3).map(e => e.title).join('; ')}`;
  } else if (highCount >= 3) {
    riskLevel = 'crisis';
    reason = `${highCount} high-severity events detected indicating active conflict`;
  } else if (highCount > 0) {
    riskLevel = 'volatile';
    reason = `${highCount} high-severity event(s) detected: ${triggeredEvents[0]?.title || 'unknown'}`;
  } else if (events.length >= 5) {
    riskLevel = 'elevated';
    reason = `${events.length} geopolitical events detected indicating elevated tensions`;
  } else if (events.length > 0) {
    riskLevel = 'elevated';
    reason = `${events.length} geopolitical event(s) detected`;
  }
  
  return {
    riskLevel,
    events,
    triggeredEvents,
    reason,
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Get the current geopolitical risk assessment for a specific country (cached or fresh)
 * @param country - Country code (EG, AE, SA, US, GLOBAL) - defaults to GLOBAL
 */
export async function getGeopoliticalRisk(
  supabase: SupabaseClient,
  forceRefresh: boolean = false,
  country: 'GLOBAL' | 'EG' | 'AE' | 'SA' | 'US' = 'GLOBAL'
): Promise<GeopoliticalRiskAssessment> {
  // Check for cached assessment (last 10 minutes)
  if (!forceRefresh) {
    const { data: cached } = await supabase
      .from('gold_signal_state')
      .select('meta')
      .eq('country', country)
      .eq('asset', 'XAUUSD')
      .maybeSingle();
    
    if (cached?.meta && typeof cached.meta === 'object') {
      const meta = cached.meta as CachedGeopoliticalMeta;
      if (meta.geopoliticalRisk && meta.geopoliticalRiskLastChecked) {
        const lastChecked = new Date(meta.geopoliticalRiskLastChecked);
        const ageMinutes = (Date.now() - lastChecked.getTime()) / (60 * 1000);
        
        if (ageMinutes < 10) {
          // Return cached if less than 10 minutes old
          return meta.geopoliticalRisk as GeopoliticalRiskAssessment;
        }
      }
    }
  }
  
  // Fetch fresh assessment for the specific country
  const assessment = await analyzeGeopoliticalRisk(supabase, 48, country);
  
  // Cache it in the state table (upsert to handle case where row doesn't exist)
  await supabase
    .from('gold_signal_state')
    .upsert(
      {
        country: country,
        asset: 'XAUUSD',
        meta: {
          geopoliticalRisk: assessment,
          geopoliticalRiskLastChecked: assessment.lastChecked,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'country,asset' }
    );
  
  return assessment;
}
