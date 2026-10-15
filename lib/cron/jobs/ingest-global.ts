import { runGlobalIngestionCycle } from '@/lib/gold-ingestion-engine';


export async function GET(request: Request) {
  const reqId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
  const startedAt = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const providedSecret =
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    new URL(request.url).searchParams.get('secret');

  if (isDevelopment) {
    if (providedSecret && providedSecret !== 'dev' && cronSecret && providedSecret !== cronSecret) {
      console.warn('[Ingest-Global] unauthorized (dev mismatch)', { reqId });
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    const isVercelCron = request.headers.get('x-vercel-id') !== null;
    if (!isVercelCron && cronSecret) {
      if (providedSecret !== cronSecret) {
        console.warn('[Ingest-Global] unauthorized (prod secret mismatch)', { reqId });
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
  }

  console.log('[Ingest-Global] started', { reqId });

  try {
    const globalResult = await runGlobalIngestionCycle();

    console.log('[Ingest-Global] completed', {
      reqId,
      countries: Object.keys(globalResult.results),
      inserted: globalResult.totalInserted,
      tookMs: Date.now() - startedAt,
    });

    const allErrors: Array<{ source: string; error: string }> = [];
    for (const [country, result] of Object.entries(globalResult.results)) {
      result.errors.forEach((err) => allErrors.push({ source: country, error: err }));
    }

    return Response.json(
      {
        inserted: globalResult.totalInserted,
        countriesProcessed: Object.keys(globalResult.results).length,
        countryResults: globalResult.results,
        errors: allErrors.length > 0 ? allErrors : undefined,
        timestamp: Date.now(),
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Ingest-Global] error', { reqId, tookMs: Date.now() - startedAt, error: errorMessage });

    return Response.json(
      {
        inserted: 0,
        errors: [{ source: 'system', error: errorMessage }],
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
