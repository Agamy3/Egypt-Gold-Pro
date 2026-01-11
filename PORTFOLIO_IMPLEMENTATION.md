# Gold Portfolio / Holdings Feature Implementation

## Summary

Implemented a complete Gold Portfolio tracking system for authenticated users, allowing them to track their gold holdings with real-time valuations, profit/loss calculations, and breakdown by karat.

---

## SQL Migration Script

Run this in Supabase SQL Editor:

```sql
-- Migration: User Gold Holdings / Portfolio
-- Idempotent SQL script for Supabase
-- Run in Supabase SQL Editor

-- ============================================
-- USER GOLD HOLDINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_gold_holdings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country TEXT NULL CHECK (country IN ('EG', 'AE', 'SA', 'US')),
  karat INTEGER NOT NULL CHECK (karat IN (14, 18, 21, 24)),
  grams NUMERIC NOT NULL CHECK (grams > 0),
  purchase_price_per_gram NUMERIC NOT NULL CHECK (purchase_price_per_gram > 0),
  purchase_currency TEXT NOT NULL CHECK (purchase_currency IN ('EGP', 'USD', 'AED', 'SAR')),
  purchased_at DATE NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_gold_holdings_user_id_karat ON public.user_gold_holdings(user_id, karat);
CREATE INDEX IF NOT EXISTS idx_user_gold_holdings_user_id_created_at ON public.user_gold_holdings(user_id, created_at DESC);

-- Updated_at trigger function (reuse existing if available, otherwise create)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_user_gold_holdings_updated_at ON public.user_gold_holdings;
CREATE TRIGGER update_user_gold_holdings_updated_at
  BEFORE UPDATE ON public.user_gold_holdings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.user_gold_holdings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own holdings" ON public.user_gold_holdings;
CREATE POLICY "Users can view own holdings"
  ON public.user_gold_holdings
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own holdings" ON public.user_gold_holdings;
CREATE POLICY "Users can insert own holdings"
  ON public.user_gold_holdings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own holdings" ON public.user_gold_holdings;
CREATE POLICY "Users can update own holdings"
  ON public.user_gold_holdings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own holdings" ON public.user_gold_holdings;
CREATE POLICY "Users can delete own holdings"
  ON public.user_gold_holdings
  FOR DELETE
  USING (auth.uid() = user_id);
```

---

## Files Changed

### New Files Created:

1. **Database Migration:**
   - `supabase/migrations/0006_user_gold_holdings.sql` - SQL migration script for user_gold_holdings table

2. **API Routes:**
   - `app/api/portfolio/route.ts` - GET (list holdings with calculations) and POST (create holding)
   - `app/api/portfolio/[id]/route.ts` - PATCH (update holding) and DELETE (delete holding)

3. **UI Pages:**
   - `app/portfolio/page.tsx` - Portfolio page with summary cards, breakdown, and holdings table

### Modified Files:

1. **Components:**
   - `components/AccountMenu.tsx` - Added "Portfolio" link to account menu (before Profile)

---

## Features Implemented

### 1. Authentication
- ✅ Only authenticated users can access portfolio
- ✅ Unauthenticated users are redirected to sign-in
- ✅ All API routes check authentication

### 2. Data Model
- ✅ `user_gold_holdings` table with all required columns
- ✅ RLS policies for security (users can only access their own data)
- ✅ Indexes for performance
- ✅ Updated_at trigger for automatic timestamp updates

### 3. API Routes
- ✅ GET `/api/portfolio?country=EG&currency=EGP` - Returns holdings with calculations
- ✅ POST `/api/portfolio` - Create new holding
- ✅ PATCH `/api/portfolio/:id` - Update existing holding
- ✅ DELETE `/api/portfolio/:id` - Delete holding

### 4. Calculations
- ✅ Uses existing `getMarketMedians` for current prices
- ✅ Uses existing `convertMoney` for currency conversion (USD pivot)
- ✅ Calculates P/L, P/L%, and status (WIN/LOSS/FLAT) for each holding
- ✅ Aggregates by karat with averages and totals
- ✅ Overall totals with status

### 5. UI Components
- ✅ Summary cards: Total Invested, Current Value, P/L, Status
- ✅ Breakdown by karat with details and status badges
- ✅ Holdings table with all columns and actions
- ✅ Portfolio link in AccountMenu
- ✅ Responsive design matching existing dashboard

---

## Verification Commands

### 1. GET Portfolio (after authentication)

```bash
# First, sign in to get a session cookie, then:
curl -X GET "http://localhost:3000/api/portfolio?country=EG&currency=EGP" \
  -H "Cookie: your_session_cookie_here" \
  | jq '.totals, .karatAggregates, .holdings | length'
```

### 2. POST Create Holding

```bash
curl -X POST "http://localhost:3000/api/portfolio" \
  -H "Content-Type: application/json" \
  -H "Cookie: your_session_cookie_here" \
  -d '{
    "karat": 24,
    "grams": 50,
    "purchasePricePerGram": 6000,
    "purchaseCurrency": "EGP",
    "purchasedAt": "2024-01-15",
    "notes": "First purchase",
    "country": "EG"
  }' | jq '.holding'
```

### 3. GET Portfolio After Insert

```bash
curl -X GET "http://localhost:3000/api/portfolio?country=EG&currency=EGP" \
  -H "Cookie: your_session_cookie_here" \
  | jq '.holdings[0], .totals'
```

### 4. PATCH Update Holding

```bash
# Replace :id with actual holding ID from GET response
curl -X PATCH "http://localhost:3000/api/portfolio/1" \
  -H "Content-Type: application/json" \
  -H "Cookie: your_session_cookie_here" \
  -d '{
    "grams": 60,
    "notes": "Updated notes"
  }' | jq '.holding'
```

### 5. DELETE Holding

```bash
# Replace :id with actual holding ID
curl -X DELETE "http://localhost:3000/api/portfolio/1" \
  -H "Cookie: your_session_cookie_here" \
  | jq '.success'
```

---

## Testing Steps

1. **Run SQL Migration:**
   - Copy the SQL script above
   - Run it in Supabase SQL Editor

2. **Sign In:**
   - Navigate to `/auth/signin`
   - Sign in with your account

3. **Access Portfolio:**
   - Click "Portfolio" in the account menu (or navigate to `/portfolio`)
   - Should see empty portfolio with "No holdings" message

4. **Add Holding:**
   - Click "+ Add" button (UI implementation for form is basic - can be enhanced)
   - Or use the POST API directly

5. **View Calculations:**
   - Portfolio should show totals, breakdown by karat, and holdings table
   - Values should be in the selected currency
   - P/L calculations should reflect current market prices

6. **Change Country/Currency:**
   - Use the dropdowns to change country/currency
   - Portfolio should recalculate and update automatically

---

## Notes

- The portfolio page currently shows a basic table. The Add/Edit/Delete functionality in the UI can be enhanced with modals/forms.
- Current prices are fetched from the existing `market_snapshots_norm` table using the same logic as the dashboard.
- Currency conversion uses USD as a pivot (same as existing FX system).
- Status badges (WIN/LOSS) appear when P/L% >= 5% or <= -5%.
- The portfolio automatically updates when country/currency selection changes (via URL query params).

