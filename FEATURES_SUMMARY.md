# EgyptGold Pro - Complete Features Summary

## 📊 **Core Market Data & Pricing**

### Global Gold Spot
- **XAU/USD Spot Price**: Real-time global gold price per troy ounce from GoldAPI.io
- **Canonical Source**: Single source of truth for global spot prices
- **Caching**: 30-60 second cache with stale data fallback
- **Display**: Shows USD per troy ounce with timestamp and stale indicators

### Local Market Prices
- **Multi-Country Support**: Egypt (EG), UAE (AE), Saudi Arabia (SA), USA (US)
- **Multi-Karat Display**: 24K, 21K, 18K (and 14K, 22K where available)
- **Median Calculation**: Aggregates prices from multiple trusted sources
- **Source Tracking**: Shows active source count and last update times
- **Trusted Mode**: Filter to only show verified/trusted price sources
- **Currency Support**: EGP, AED, SAR, USD

### Market Variance Analysis
- **Fair Value Calculation**: Computes expected local prices from global spot + FX rates
- **Premium/Discount Detection**: Classifies market as FAIR, PREMIUM, or DISCOUNT
- **Variance Percentage**: Shows over/under pricing relative to fair value
- **Real FX Rates**: Uses official USD/local currency exchange rates

### Pricing Details
- **USD per Gram (24K)**: Derived from global spot price
- **USD per Gram (21K)**: Adjusted by 21/24 purity ratio
- **Fair Value Estimates**: Expected local prices based on global spot + FX
- **Local Market Parity**: Market-implied exchange rates

### Exchange Rates
- **Multi-Currency FX**: USD/EGP, USD/AED, USD/SAR
- **Real-Time Updates**: Live exchange rate data
- **Stale Detection**: Flags outdated or stale FX data

---

## 🎯 **Gold Signals System**

### Stateful Risk-First Signals Engine
- **Signal Types**: BUY, SELL, HOLD (stateful, not per-cycle)
- **Risk-First Logic**: HOLD interrupts quickly on volatility/choppy markets
- **Confirmation Required**: HOLD → BUY/SELL requires 2 consecutive confirmations
- **Direct Flips**: Rare direct BUY ↔ SELL flips only with high confidence (≥0.80)
- **Raw vs Final**: Stores both raw algorithmic signals and final stateful decisions
- **Active Until Changed**: Signals remain active until explicitly changed

### Signal Display
- **Final Action Badge**: Shows current active signal (BUY/SELL/HOLD)
- **Confidence Ring**: Visual confidence indicator (Low/Medium/High)
- **Active Since**: Timestamp when current signal became active
- **Last Evaluated**: Timestamp of most recent algorithm evaluation
- **5-Minute Change**: Percentage change in XAU/USD over 5 minutes
- **Volatility Proxy**: Market volatility indicator
- **Asia Session Flag**: Indicates if signal was computed during Asia trading hours
- **Variance (EG)**: Local market variance for Egypt-specific signals

### AI Risk Validation (Premium)
- **Optional AI Review**: Premium users can enable AI validation
- **Risk Assessment**: AI evaluates market context and risk factors
- **Override Capability**: AI can override algorithm signals with ≥0.80 confidence
- **Risk Brake**: AI can force HOLD when risk is elevated (<0.80 confidence)
- **Decision Tracking**: Records AI decisions (approved/downgraded/overridden)
- **Cached Results**: AI reviews cached per cycle to reduce costs

### Signal History
- **Last 12 Signals**: Displays recent signal history
- **Cycle Tracking**: UTC-aligned 5-minute cycles
- **Outcome Validation**: Tracks signal accuracy over time

---

## 💰 **Premium Features**

### Premium Subscription
- **Monthly Plan**: 99 EGP/month
- **Yearly Plan**: 899 EGP/year
- **Paymob Integration**: Secure payment processing via Paymob
- **Automatic Activation**: Premium activated immediately after successful payment
- **Entitlement Management**: Server-side entitlement tracking with idempotency

### Premium Benefits
- **AI Signal Validation**: Access to AI risk assessment for signals
- **Premium News**: Enhanced news with summaries, context, and "why it matters"
- **Silver Prices**: Access to silver spot and local silver prices
- **Macro Analysis (US)**: US market macro indicators and analysis
- **Ad-Free Experience**: No advertisements for premium users
- **Advanced Notifications**: Enhanced notification rules and delivery

### Coupon System
- **Coupon Redemption**: Users can redeem discount/premium coupons
- **Admin Management**: Admins can create and manage coupons
- **One-Time Use**: Coupons tracked to prevent duplicate redemption

### Premium Requests
- **Request Access**: Non-premium users can request premium access
- **Admin Review**: Admins can approve/deny premium requests
- **Default Premium**: Admin setting to auto-grant premium to all new signups

---

## 📱 **Notifications System**

### Notification Types
- **Price Change Alerts**: Notify on percentage price moves (configurable threshold)
- **Watchlist Alerts**: Notify when prices change for watched countries
- **Silver Price Alerts**: Silver price change notifications (premium)
- **In-App Notifications**: Real-time in-app notification center
- **Push Notifications**: Browser push notifications (with user permission)
- **Email Notifications**: Email alerts for price changes

### Notification Rules
- **Customizable Thresholds**: Set percentage thresholds (e.g., 0.5% for 24K)
- **Multi-Channel**: Choose in-app, push, and/or email delivery
- **Country-Specific**: Set rules per country (EG, AE, SA, US)
- **Karat-Specific**: Target specific karats (24K, 21K, 18K, etc.)
- **One-Time vs Recurring**: Configure one-time or recurring alerts
- **Default Rules**: Auto-created default notification rule on signup

### Notification Management
- **Notification Center**: View all in-app notifications
- **Mark as Read**: Mark notifications as read/unread
- **Delete Notifications**: Remove old notifications
- **Delivery Tracking**: Track notification delivery status

---

## 🧮 **Calculators & Converters**

### Money-to-Gold Calculator
- **Input**: Amount in local currency (EGP, AED, SAR, USD)
- **Output**: Equivalent gold in grams (24K, 21K, 18K)
- **Fee Calculation**: Configurable transaction fees
- **Saved Preferences**: Remembers last amount and fees (authenticated users)
- **Real-Time Prices**: Uses current market prices for calculations

### Gold-to-Gold Converter
- **Karat Conversion**: Convert between different karat purities
- **Input Karat Dropdown**: Select source karat (24K, 22K, 21K, 18K, 14K)
- **Output Karat Dropdown**: Select target karat
- **Purity-Based Math**: Calculates equivalent pure gold content
- **Formula Display**: Shows conversion formula and explanation
- **Real-Time Calculation**: Updates as you type

---

## 📈 **Portfolio Tracking**

### Gold Holdings Management
- **Add Holdings**: Record gold purchases with details
- **Edit Holdings**: Update existing holdings
- **Delete Holdings**: Remove holdings from portfolio
- **Multi-Karat Support**: Track 14K, 18K, 21K, 24K holdings
- **Multi-Country**: Holdings can be country-specific
- **Purchase Details**: Record purchase price, date, currency, notes

### Portfolio Analytics
- **Total Investment**: Sum of all invested values
- **Current Value**: Real-time portfolio value based on current prices
- **P&L Tracking**: Profit/Loss in absolute and percentage terms
- **Status Indicators**: WIN/LOSS/FLAT status per holding
- **Karat Aggregates**: Summary by karat type
- **Currency Conversion**: View portfolio in selected currency

---

## 📰 **News & Market Intelligence**

### News Feed
- **Multi-Country News**: Filter by EG, AE, SA, US, or GLOBAL
- **Public News**: Free access to headlines and sources
- **Premium News**: Enhanced articles with:
  - AI-generated summaries
  - "Why It Matters" context
  - Relevant tags
  - Context tags
- **Source Tracking**: Shows news source and publication date
- **Image Support**: News articles with images
- **Auto-Ingestion**: Automated news ingestion from multiple sources

### Market Intelligence
- **Macro Indicators (US)**: US market macro analysis (premium)
- **Market Context**: News filtered by relevance to gold market
- **Trend Analysis**: Historical signal patterns and outcomes

---

## 🔔 **User Account & Preferences**

### Authentication
- **Email/Password Signup**: Standard email-based registration
- **OAuth Support**: OAuth authentication
- **Password Reset**: Forgot password functionality
- **Session Management**: Secure session handling
- **Sign Out**: Single and "sign out all devices" options

### User Profile
- **Display Name**: Customizable display name
- **Preferred Country**: Set default country (EG, AE, SA, US)
- **Email Notifications**: Toggle email notification preferences
- **Push Notifications**: Enable/disable push notifications
- **Language Preference**: English/Arabic (RTL support)

### Account Management
- **Account Deletion**: Users can delete their accounts
- **Data Export**: (Implicit via API access)
- **Privacy Settings**: Cookie preferences and consent management

---

## 🌍 **Multi-Country Support**

### Supported Countries
- **Egypt (EG)**: Primary market with 24K, 21K, 18K support
- **UAE (AE)**: AED currency, local market prices
- **Saudi Arabia (SA)**: SAR currency, local market prices
- **USA (US)**: USD currency, macro analysis features

### Country-Specific Features
- **Local Prices**: Country-specific gold prices per karat
- **Currency Display**: Automatic currency formatting
- **Market Variance**: Country-specific variance calculations
- **News Filtering**: Country-specific news feeds

---

## 🥈 **Silver Market (Premium)**

### Silver Prices
- **Global Silver Spot**: XAG/USD per troy ounce
- **Local Silver Prices**: Country-specific silver prices
- **Multi-Karat**: 999, 925, 900, 800 silver purities
- **Price Direction**: UP/DOWN/STALE indicators
- **Confidence Levels**: High/Medium/Low confidence indicators
- **Change Tracking**: Price change values and percentages

---

## 🛠️ **Admin Features**

### Admin Dashboard
- **Gold Signals Admin**: View all signals, AI reviews, metrics
- **Billing Management**: Paymob orders, webhooks, entitlement management
- **News Management**: Manual news ingestion, source management
- **Coupon Management**: Create, edit, delete coupons
- **Premium Requests**: Approve/deny premium access requests
- **Notifications Debug**: Test push notifications, debug cycles
- **Settings Management**: Default premium for new users toggle

### Admin Analytics
- **Signal Metrics**: Algorithm accuracy, AI override rates, signal distribution
- **Billing Analytics**: Payment success rates, revenue tracking
- **User Analytics**: Premium user counts, usage statistics

### Admin Tools
- **30-Second Forecast**: Forecast bot management and export
- **Alpaca Paper Trading**: Paper trading system management
- **Forecast Bot**: Minute-by-minute forecast bot controls
- **Market Backfill**: Manual data backfill tools

---

## 🔄 **Automated Systems (Cron Jobs)**

### Data Ingestion
- **Gold Spot Ingestion**: Fetches and stores XAU/USD prices
- **Local Price Ingestion**: Fetches local market prices from multiple sources
- **Silver Ingestion**: Fetches silver spot and local prices
- **News Ingestion**: Automated news article collection
- **FX Rate Updates**: Exchange rate data updates

### Signal Evaluation
- **5-Minute Cycles**: UTC-aligned signal evaluation every 5 minutes
- **State Machine**: Risk-first stateful signal derivation
- **Outcome Validation**: Validates past signals against actual price movements

### Notification Processing
- **Price Change Detection**: Evaluates notification rules on price changes
- **Notification Delivery**: Sends in-app, push, and email notifications
- **Watchlist Monitoring**: Monitors watched countries for changes

---

## 🎨 **User Interface Features**

### Responsive Design
- **Mobile-First**: Optimized for mobile devices
- **Tablet Support**: Responsive tablet layouts
- **Desktop**: Full-featured desktop experience

### Internationalization
- **Bilingual**: English and Arabic support
- **RTL Support**: Right-to-left layout for Arabic
- **Language Toggle**: Easy language switching

### Accessibility
- **Hover Tips**: Contextual help tooltips
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Reader Support**: ARIA labels and semantic HTML

### UI Components
- **Confidence Rings**: Visual confidence indicators
- **Status Badges**: Color-coded status indicators
- **Charts**: Price charts and forecast visualizations
- **Modals**: Interactive modals for forms and confirmations

---

## 🔒 **Security & Privacy**

### Security Features
- **Row-Level Security (RLS)**: Database-level access control
- **Service Role Protection**: Server-side secrets never exposed
- **HMAC Verification**: Paymob webhook HMAC validation
- **Idempotency**: Prevents duplicate payment processing
- **Session Security**: Secure cookie-based sessions

### Privacy Features
- **Cookie Consent**: GDPR-compliant cookie consent banner
- **Privacy Policy**: Comprehensive privacy policy
- **Terms of Service**: Clear terms and conditions
- **Data Minimization**: Only collect necessary data

---

## 📊 **Data Sources & Integration**

### Gold Price Sources
- **GoldAPI.io**: Global XAU/USD spot prices (primary)
- **Gold-API.com**: Egypt Market Implied Ounce (fallback)
- **Local Sources**: Multiple trusted local market data providers

### FX Rate Sources
- **Multi-Source FX**: Aggregated exchange rate data
- **Real-Time Updates**: Live FX rate updates
- **Fallback Handling**: Graceful degradation on source failures

### News Sources
- **Multiple Aggregators**: News from various gold market sources
- **AI Enhancement**: Premium news enhanced with AI summaries

---

## 🚀 **Performance & Reliability**

### Caching Strategy
- **Client-Side Caching**: no-store headers for market-sensitive data
- **Server-Side Caching**: TTL-based caching for external APIs
- **Stale Data Handling**: Graceful degradation with stale indicators

### Error Handling
- **Source Failure Handling**: Continues with available sources
- **Fallback Mechanisms**: Multiple fallback data sources
- **User-Friendly Errors**: Clear error messages to users
- **Stale Indicators**: Visual indicators for outdated data

### Monitoring
- **Health Checks**: API health check endpoints
- **Source Audit**: Debug panel for source status
- **Error Logging**: Comprehensive error logging

---

## 📱 **Progressive Web App (PWA)**

### PWA Features
- **Install Prompt**: Users can install as app
- **Offline Support**: Basic offline functionality
- **Push Notifications**: Browser push notification support
- **App-Like Experience**: Native app-like UI/UX

---

## 🎯 **Special Features**

### Share Functionality
- **Signal Sharing**: Share gold signals with others
- **Trust Badges**: Visual trust indicators for shared signals

### Activity Tracking
- **User Activity**: Ping endpoint for activity tracking
- **Usage Analytics**: Track feature usage

### Debug Tools
- **Source Audit Panel**: Inspect data source status
- **Debug Endpoints**: Admin debug tools
- **Test Utilities**: Testing tools for notifications and signals

---

## 📋 **Summary by Category**

### Core Features (Free)
- ✅ Global gold spot prices
- ✅ Local market prices (24K, 21K, 18K)
- ✅ Market variance analysis
- ✅ Gold signals (BUY/SELL/HOLD)
- ✅ Money-to-Gold calculator
- ✅ Gold-to-Gold converter
- ✅ Portfolio tracking
- ✅ Basic notifications
- ✅ Public news feed
- ✅ Multi-country support
- ✅ Multi-language (EN/AR)

### Premium Features
- ✅ AI signal validation
- ✅ Premium news (with summaries)
- ✅ Silver prices
- ✅ US macro analysis
- ✅ Ad-free experience
- ✅ Advanced notifications
- ✅ Enhanced portfolio analytics

### Admin Features
- ✅ Signal management
- ✅ Billing management
- ✅ User management
- ✅ Coupon system
- ✅ News management
- ✅ Analytics dashboard
- ✅ Settings management

### Technical Features
- ✅ Real-time data updates
- ✅ Automated cron jobs
- ✅ Secure payment processing
- ✅ Multi-source data aggregation
- ✅ Error handling & fallbacks
- ✅ PWA support
- ✅ Responsive design
- ✅ RTL support

---

**Total Feature Count**: 100+ features across 15+ major categories
