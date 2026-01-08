# Historical Data Sources Recommendations

## Current Implementation

### Global XAUUSD (Gold Spot) Data
- **Primary Source**: GoldAPI.io (free tier)
- **Storage**: `gold_spot` table with `xau_spot_usd_oz` and `fetched_at`
- **Frequency**: ~30-60 second snapshots
- **Limitation**: Real-time snapshots only; no historical bulk import

### Local Market (Egypt Gold) Data
- **Primary Sources**: 
  - `goldbullioneg` (trusted-only mode)
  - `banklive`, `gold_era`, `dokangold`, `goldrate24` (aggregated)
- **Storage**: `market_snapshots` table with `market21Buy`, `market24Buy`, `createdAt`
- **Frequency**: Per-source ingestion cycles
- **Limitation**: Real-time snapshots only; historical data accumulates over time

## Recommended Historical Data Providers

### Option 1: Metals-API (Recommended for Global XAUUSD)
- **URL**: https://metals-api.com
- **Features**:
  - Historical time series endpoints (daily, hourly)
  - OHLC data support
  - Free tier available (rate-limited)
  - Paid tiers for higher volume
- **Implementation**:
  - Store daily OHLC in new `gold_spot_historical` table
  - Backfill historical data via API
  - Use for monthly/year-over-year charts
- **Pros**: Reliable, official API, good documentation
- **Cons**: Free tier has rate limits

### Option 2: GoldAPI.io Historical Endpoints
- **URL**: https://goldapi.io
- **Features**:
  - May offer historical endpoints depending on plan
  - Already integrated for real-time data
- **Implementation**:
  - Check if historical endpoints available on current plan
  - Extend existing `gold_spot` table with historical flags
- **Pros**: Already in use, consistent data source
- **Cons**: Historical endpoints may require paid plan

### Option 3: Alpha Vantage
- **URL**: https://www.alphavantage.co
- **Features**:
  - FX Daily/Intraday APIs
  - XAUUSD coverage via FX endpoints
  - Free tier with API key
- **Implementation**:
  - Use `FX_DAILY` or `FX_INTRADAY` for XAUUSD
  - Store as daily aggregates
- **Pros**: Free tier, good for historical data
- **Cons**: Metals coverage varies, rate limits on free tier

### Option 4: TradingView (Not Recommended for Data Extraction)
- **URL**: https://www.tradingview.com
- **Use Case**: Chart embedding only (already removed from codebase)
- **Note**: Not intended as a free historical data API. Extracting data violates ToS.

### Option 5: Unofficial Sources (Not Recommended)
- **Stooq**: Fragile, ToS risk, stability issues
- **Yahoo Finance**: Unofficial, can break without notice
- **Avoid**: Use only if no other options, accept instability

## Recommendation

**Primary**: Metals-API for global XAUUSD historical data
- Implement daily OHLC import
- Store in `gold_spot_historical` table
- Use for long-term charts (monthly, YOY)

**Fallback**: Continue using snapshot accumulation
- Current `gold_spot` and `market_snapshots` tables
- Suitable for daily/weekly ranges
- Will build historical data over time

**Local Market**: Continue using current snapshot system
- `market_snapshots` table already captures historical data
- Aggregate to daily points for long-term analysis
- No external API needed for Egypt market history

## Implementation Notes

1. For new historical API integration:
   - Add migration for `gold_spot_historical` table
   - Implement backfill script for historical data
   - Update `/api/forecast/series` to use historical table for monthly/YOY ranges

2. For local market historical:
   - Aggregate `market_snapshots` to daily median prices
   - Store in cache or derived table
   - Use for local market historical charts

3. Performance:
   - Index `fetched_at` and `createdAt` columns
   - Consider materialized views for daily aggregates
   - Cache daily/weekly aggregations


