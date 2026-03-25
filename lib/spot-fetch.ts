/**
 * Global Gold Spot Fetching with Fallback
 * 
 * Primary: GoldAPI.io (requires GOLDAPI_KEY)
 * Fallback: Stooq (no API key required)
 * 
 * Rules:
 * - Never throws
 * - Never derives spot from Egypt prices
 * - Explicitly labels source
 */

export interface SpotFetchResult {
  price: number | null;
  source: 'GoldAPI' | 'Stooq' | null;
  error: string | null;
}

export interface SpotHistoryPoint {
  t: number; // epoch ms
  v: number; // USD per oz
}

export interface GoldApiError {
  status?: number;
  message: string;
  rawResponse?: string;
}

/**
 * Fetch from GoldAPI.io
 */
async function fetchGoldAPI(): Promise<{ price: number | null; error: GoldApiError | null }> {
  const apiKey = process.env.GOLDAPI_KEY || process.env.GOLDAPI_API_KEY;
  if (!apiKey) {
    return {
      price: null,
      error: { message: 'GOLDAPI_KEY environment variable not configured' },
    };
  }

  try {
    const response = await fetch('https://www.goldapi.io/api/XAU/USD', {
      headers: {
        'x-access-token': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const responseText = await response.text();
    const rawResponseSnippet = responseText.substring(0, 500);

    if (!response.ok) {
      // 401/403 means unauthorized/forbidden - key invalid or missing
      if (response.status === 401 || response.status === 403) {
        return {
          price: null,
          error: {
            status: response.status,
            message: `GoldAPI authentication failed (HTTP ${response.status})`,
            rawResponse: rawResponseSnippet,
          },
        };
      }
      return {
        price: null,
        error: {
          status: response.status,
          message: `GoldAPI HTTP ${response.status}: ${response.statusText}`,
          rawResponse: rawResponseSnippet,
        },
      };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      return {
        price: null,
        error: {
          message: 'Failed to parse GoldAPI response as JSON',
          rawResponse: rawResponseSnippet,
        },
      };
    }

    // Check if price field exists and is numeric
    if (typeof data['price'] !== 'number' || isNaN(data['price']) || data['price'] <= 0) {
      return {
        price: null,
        error: {
          message: `GoldAPI response missing or invalid price field. Received: ${JSON.stringify(data).substring(0, 200)}`,
          rawResponse: rawResponseSnippet,
        },
      };
    }

    return {
      price: data['price'] as number,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      price: null,
      error: {
        message: `GoldAPI fetch failed: ${errorMessage}`,
      },
    };
  }
}

/**
 * Fetch from Stooq (fallback, no API key required)
 * Endpoint: https://stooq.com/q/l/?s=xauusd&i=d
 * Returns CSV format - may have header line or just data line
 */
async function fetchStooq(): Promise<{ price: number | null; error: string | null }> {
  try {
    const response = await fetch('https://stooq.com/q/l/?s=xauusd&i=d', {
      headers: {
        'Content-Type': 'text/csv',
        'User-Agent': 'Mozilla/5.0 (compatible; EgyptGold-Pro/1.0)',
      },
    });

    if (!response.ok) {
      const responseText = await response.text();
      const rawSnippet = responseText.substring(0, 200);
      return {
        price: null,
        error: `Stooq HTTP ${response.status}: ${response.statusText}. Response: ${rawSnippet}`,
      };
    }

    const responseText = await response.text();
    const rawSnippet = responseText.substring(0, 200);

    // Parse CSV: Handle both formats
    // Format 1: Header + data (2+ lines)
    // Format 2: Single data line (known order: Symbol,Date,Time,Open,High,Low,Close,Volume)
    
    // Handle CRLF and trailing newlines
    const normalizedText = responseText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    
    // Split into lines and filter out empty lines
    const lines = normalizedText.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length === 0) {
      return {
        price: null,
        error: `Stooq response is empty. Response: ${rawSnippet}`,
      };
    }

    let closePrice: number | null = null;
    let dataLine = '';

    if (lines.length >= 2) {
      // Format 1: Header + data line
      // First line is header, second line is data
      const headerLine = lines[0];
      dataLine = lines[1];

      // Parse header to find Close column index
      const headers = headerLine.split(',').map(h => h.trim().toLowerCase());
      const closeIndex = headers.indexOf('close');

      if (closeIndex === -1) {
        return {
          price: null,
          error: `Stooq response missing 'Close' column. Headers: ${headerLine.substring(0, 200)}. Response: ${rawSnippet}`,
        };
      }

      // Parse data line - handle trailing commas
      const dataFields = dataLine.split(',').map(f => f.trim());
      
      if (dataFields.length <= closeIndex) {
        return {
          price: null,
          error: `Stooq data line has insufficient fields (expected ${closeIndex + 1}, got ${dataFields.length}). Raw line: ${dataLine.substring(0, 200)}`,
        };
      }

      const closePriceStr = dataFields[closeIndex];
      closePrice = parseFloat(closePriceStr);
    } else {
      // Format 2: Single data line (no header)
      // Known order: Symbol,Date,Time,Open,High,Low,Close,Volume
      // Close is at index 6 (7th value)
      dataLine = lines[0];
      
      // Parse data line - handle trailing commas by trimming all fields
      const dataFields = dataLine.split(',').map(f => f.trim());
      
      if (dataFields.length < 7) {
        return {
          price: null,
          error: `Stooq single-line response has insufficient fields (expected 7+, got ${dataFields.length}). Raw line: ${dataLine.substring(0, 200)}`,
        };
      }

      // Close is at index 6 (7th column)
      const closePriceStr = dataFields[6];
      closePrice = parseFloat(closePriceStr);
    }

    // Validate parsed price
    if (closePrice === null || isNaN(closePrice) || closePrice <= 0) {
      return {
        price: null,
        error: `Stooq Close price is invalid or missing: "${closePrice}". Raw line: ${dataLine.substring(0, 200)}`,
      };
    }

    // Validate the price is reasonable (2000-3000 range)
    if (closePrice < 2000 || closePrice > 3000) {
      return {
        price: null,
        error: `Stooq price out of range: ${closePrice} (expected 2000-3000). Raw line: ${dataLine.substring(0, 200)}`,
      };
    }

    return {
      price: closePrice,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      price: null,
      error: `Stooq fetch failed: ${errorMessage}`,
    };
  }
}

/**
 * Fetch daily historical closes from Stooq (no API key required).
 * Endpoint: https://stooq.com/q/d/l/?s=xauusd&i=d
 * Returns CSV with header: Date,Open,High,Low,Close,Volume
 */
export async function fetchStooqHistoryDaily(days: number): Promise<{ points: SpotHistoryPoint[]; error: string | null }> {
  try {
    const response = await fetch('https://stooq.com/q/d/l/?s=xauusd&i=d', {
      headers: {
        'Content-Type': 'text/csv',
        'User-Agent': 'Mozilla/5.0 (compatible; EgyptGold-Pro/1.0)',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        points: [],
        error: `Stooq history HTTP ${response.status}: ${response.statusText}. Response: ${text.substring(0, 200)}`,
      };
    }

    const csv = (await response.text()).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const lines = csv.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return { points: [], error: 'Stooq history response too short' };
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const dateIdx = header.indexOf('date');
    const closeIdx = header.indexOf('close');
    if (dateIdx === -1 || closeIdx === -1) {
      return { points: [], error: `Stooq history missing Date/Close columns. Header: ${lines[0].substring(0, 200)}` };
    }

    // Take last N rows (most recent days)
    const dataLines = lines.slice(1);
    const recent = dataLines.slice(Math.max(0, dataLines.length - Math.max(1, days)));

    const points: SpotHistoryPoint[] = [];
    for (const line of recent) {
      const cols = line.split(',').map((c) => c.trim());
      if (cols.length <= Math.max(dateIdx, closeIdx)) continue;
      const dateStr = cols[dateIdx];
      const close = parseFloat(cols[closeIdx]);
      if (!dateStr || !isFinite(close) || close <= 0) continue;

      // Use noon UTC to avoid timezone edge issues
      const t = Date.parse(`${dateStr}T12:00:00Z`);
      if (!isFinite(t)) continue;

      // Validate a reasonable range
      if (close < 2000 || close > 3000) continue;
      points.push({ t, v: close });
    }

    points.sort((a, b) => a.t - b.t);
    return { points, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { points: [], error: `Stooq history fetch failed: ${errorMessage}` };
  }
}

/**
 * Fetch global spot with fallback
 * Tries GoldAPI first, then Stooq if GoldAPI fails
 * Never throws, always returns { price, source, error }
 */
export async function fetchGlobalSpot(): Promise<SpotFetchResult> {
  // Try GoldAPI first (primary source)
  const goldApiResult = await fetchGoldAPI();
  
  if (goldApiResult.price !== null) {
    return {
      price: goldApiResult.price,
      source: 'GoldAPI',
      error: null,
    };
  }

  // GoldAPI failed, try Stooq (fallback)
  console.log('GoldAPI failed, trying Stooq fallback:', goldApiResult.error?.message);
  const stooqResult = await fetchStooq();

  if (stooqResult.price !== null) {
    return {
      price: stooqResult.price,
      source: 'Stooq',
      error: null,
    };
  }

  // Both sources failed
  return {
    price: null,
    source: null,
    error: `No global spot source available. GoldAPI: ${goldApiResult.error?.message || 'unknown error'}. Stooq: ${stooqResult.error || 'unknown error'}`,
  };
}

