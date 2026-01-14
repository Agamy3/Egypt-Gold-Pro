import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { LanguageProvider } from '@/components/LanguageProvider'
import { Analytics } from '@vercel/analytics/next'
import CookieConsentBanner from '@/components/CookieConsentBanner'
import Sidebar from '@/components/layout/Sidebar'
import MobileDrawer from '@/components/layout/MobileDrawer'

// Get site URL from environment or use fallback
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com'

// Build stamp configuration (evaluated at build time on the server)
const fullCommitSha = process.env.VERCEL_GIT_COMMIT_SHA || 'dev'
const shortCommitSha = fullCommitSha.slice(0, 7)
const buildTimeIso = process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString()

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'EgyptGold Pro - Egyptian Gold Market Analysis',
  description: 'Educational decision-support for the Egyptian gold market',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'EgyptGold Pro - Egyptian Gold Market Analysis',
    description: 'Educational decision-support for the Egyptian gold market',
    url: siteUrl,
    siteName: 'EgyptGold Pro',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'EgyptGold Pro',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EgyptGold Pro - Egyptian Gold Market Analysis',
    description: 'Educational decision-support for the Egyptian gold market',
    images: ['/twitter.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <link rel="manifest" href="/manifest.json" />
        <Script
          id="adsense-base"
          strategy="afterInteractive"
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1715676389323573"
          crossOrigin="anonymous"
        />
      </head>
      <body className="touch-pan-y bg-black">
        <LanguageProvider>
          <div className="min-h-screen flex bg-black">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-4 pt-3 flex items-center justify-between lg:hidden">
                <MobileDrawer />
              </div>
              {children}
            </div>
          </div>
        </LanguageProvider>
        {/* Global build stamp - visible on all pages, bottom-right */}
        <div className="fixed bottom-2 right-4 text-[11px] text-gray-500 font-mono bg-black/70 px-2 py-1 rounded border border-gray-800 z-40">
          Build: {shortCommitSha} • {buildTimeIso}
        </div>
        <CookieConsentBanner />
        <Analytics />
      </body>
    </html>
  )
}

