/**
 * AdSense Debug Page (Development Only)
 * 
 * Shows debug information about AdSense setup
 */

'use client';

import { useEffect, useState } from 'react';

export default function AdsDebugPage() {
  const [debugInfo, setDebugInfo] = useState<{
    adsbygoogleExists: boolean;
    scriptLoaded: boolean;
    consent: string | null;
    userStatus: any;
  }>({
    adsbygoogleExists: false,
    scriptLoaded: false,
    consent: null,
    userStatus: null,
  });

  useEffect(() => {
    // Check if adsbygoogle exists
    const adsbygoogleExists = typeof window !== 'undefined' && typeof (window as any).adsbygoogle !== 'undefined';
    
    // Check if script is loaded (look for script tag)
    const scriptLoaded = typeof document !== 'undefined' && 
      document.querySelector('script[id="adsense-base"]') !== null;

    // Check consent
    const cookieConsent = document.cookie
      .split('; ')
      .find((row) => row.startsWith('cookie_consent='))
      ?.split('=')[1];
    const localStorageConsent = localStorage.getItem('cookie_consent');
    const consent = cookieConsent || localStorageConsent;

    // Fetch user status from API
    fetch('/api/ads/check')
      .then((res) => res.json())
      .then((data) => {
        setDebugInfo({
          adsbygoogleExists,
          scriptLoaded,
          consent,
          userStatus: data,
        });
      })
      .catch((error) => {
        console.error('[AdsDebug] Error:', error);
        setDebugInfo({
          adsbygoogleExists,
          scriptLoaded,
          consent,
          userStatus: { error: error.message },
        });
      });
  }, []);

  // Only show in development
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Not available in production</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">AdSense Debug Information</h1>
        
        <div className="bg-gray-900 rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">Script Status</h2>
            <div className="space-y-2">
              <div>
                <span className="font-medium">Base Script Loaded:</span>{' '}
                <span className={debugInfo.scriptLoaded ? 'text-green-400' : 'text-red-400'}>
                  {debugInfo.scriptLoaded ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span className="font-medium">window.adsbygoogle Exists:</span>{' '}
                <span className={debugInfo.adsbygoogleExists ? 'text-green-400' : 'text-red-400'}>
                  {debugInfo.adsbygoogleExists ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Cookie Consent</h2>
            <div>
              <span className="font-medium">Status:</span>{' '}
              <span className={debugInfo.consent === 'accepted' ? 'text-green-400' : 'text-yellow-400'}>
                {debugInfo.consent || 'Not set'}
              </span>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">User Status</h2>
            <pre className="bg-gray-800 p-4 rounded overflow-auto">
              {JSON.stringify(debugInfo.userStatus, null, 2)}
            </pre>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Environment Variables</h2>
            <div className="space-y-2">
              <div>
                <span className="font-medium">NEXT_PUBLIC_ADSENSE_CLIENT:</span>{' '}
                <code className="bg-gray-800 px-2 py-1 rounded">
                  {process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'Not set'}
                </code>
              </div>
              <div>
                <span className="font-medium">NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD:</span>{' '}
                <code className="bg-gray-800 px-2 py-1 rounded">
                  {process.env.NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD || 'Not set (using fallback: 9450111383)'}
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

