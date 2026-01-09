import type { Metadata } from 'next'
import './globals.css'
import { LanguageProvider } from '@/components/LanguageProvider'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  title: 'EgyptGold Pro - Egyptian Gold Market Analysis',
  description: 'Educational decision-support for the Egyptian gold market',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
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
      </head>
      <body className="touch-pan-y">
        <LanguageProvider>{children}</LanguageProvider>
        <Analytics />
      </body>
    </html>
  )
}

