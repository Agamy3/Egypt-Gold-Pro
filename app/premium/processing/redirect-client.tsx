/**
 * Client component that auto-submits a POST form to Paymob.
 */

'use client';

import { useEffect, useRef } from 'react';

export default function PaymobRedirectClient(props: { actionUrl: string; paymentToken: string }) {
  const ref = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    // Submit ASAP after hydration
    ref.current?.submit();
  }, []);

  return (
    <form ref={ref} action={props.actionUrl} method="POST">
      <input type="hidden" name="payment_token" value={props.paymentToken} />
      {/* Paymob requires a "source" field for this endpoint. */}
      <input type="hidden" name="source" value="iframe" />
      <noscript>
        <button type="submit">Continue to payment</button>
      </noscript>
    </form>
  );
}

