import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { LanguageProvider } from '@/components/LanguageProvider'
import { Analytics } from '@vercel/analytics/next'
import CookieConsentBanner from '@/components/CookieConsentBanner'
import Sidebar from '@/components/layout/Sidebar'
import MobileDrawer from '@/components/layout/MobileDrawer'
import InstallPrompt from '@/components/pwa/InstallPrompt'
import AdsterraPopunder from '@/components/ads/AdsterraPopunder'

// Get site URL from environment or use fallback
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'EgyptGold Pro - Egyptian Gold Market Analysis',
  description: 'Educational decision-support for the Egyptian gold market',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover',
  themeColor: '#0b1220',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'EgyptGold Pro',
  },
  manifest: '/manifest.webmanifest',
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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0b1220" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="EgyptGold Pro" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <Script
          id="adsense-base"
          strategy="afterInteractive"
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1715676389323573"
          crossOrigin="anonymous"
        />
        {/* Adsterra Popunder - placed before closing </head> tag as per Adsterra instructions */}
        <AdsterraPopunder />
      </head>
      <body className="touch-pan-y bg-black">
        <LanguageProvider>
          <div className="min-h-screen flex bg-black">
            <aside className="hidden md:block">
              <Sidebar />
            </aside>
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-4 pt-3 flex items-center justify-between md:hidden">
                <MobileDrawer />
              </div>
              {children}
            </div>
          </div>
        </LanguageProvider>
        <CookieConsentBanner />
        <InstallPrompt />
        <Analytics />
        <Script
          id="service-worker-registration"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator && typeof window !== 'undefined') {
                let refreshing = false;
                
                // Handle service worker updates
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                  if (!refreshing) {
                    refreshing = true;
                    window.location.reload();
                  }
                });
                
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then((registration) => {
                      console.log('[SW] Service Worker registered:', registration.scope);
                      
                      // Check for updates every hour
                      setInterval(() => {
                        registration.update();
                      }, 3600000);
                      
                      // Check for waiting service worker
                      if (registration.waiting) {
                        // New SW is waiting, skip waiting and reload
                        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                      }
                      
                      // Listen for new service worker installing
                      registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        if (newWorker) {
                          newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                              // New SW installed, prompt user to reload
                              console.log('[SW] New service worker available');
                              // Auto-reload after 1 second
                              setTimeout(() => {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                              }, 1000);
                            }
                          });
                        }
                      });
                    })
                    .catch((error) => {
                      console.error('[SW] Service Worker registration failed:', error);
                    });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}

