import type { Metadata } from 'next'
import './globals.css'
import { LanguageProvider } from '@/components/LanguageProvider'
import { Analytics } from '@vercel/analytics/next'
import CookieConsentBanner from '@/components/CookieConsentBanner'
import NotificationPrompt from '@/components/NotificationPrompt'

// Get site URL from environment or use fallback
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com'

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
      </head>
      <body className="touch-pan-y">
        <LanguageProvider>{children}</LanguageProvider>
        <CookieConsentBanner />
        <NotificationPrompt />
        <Analytics />
      </body>
    </html>
  )
}

