import { runIngestionCycle } from '@/lib/gold-ingestion-engine';


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
      console.warn('[Ingest-EG] unauthorized (dev mismatch)', { reqId });
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    const isVercelCron = request.headers.get('x-vercel-id') !== null;
    if (!isVercelCron && cronSecret) {
      if (providedSecret !== cronSecret) {
        console.warn('[Ingest-EG] unauthorized (prod secret mismatch)', { reqId });
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
  }

  console.log('[Ingest-EG] started', { reqId });

  try {
    const egResult = await runIngestionCycle();
    const inserted = egResult.sourcesWritten + (egResult.aggregatedSnapshotWritten ? 1 : 0);

    console.log('[Ingest-EG] completed', {
      reqId,
      inserted,
      sourcesWritten: egResult.sourcesWritten,
      aggregatedWritten: egResult.aggregatedSnapshotWritten,
      tookMs: Date.now() - startedAt,
    });

    return Response.json(
      {
        inserted,
        sourcesWritten: egResult.sourcesWritten,
        aggregatedWritten: egResult.aggregatedSnapshotWritten,
        ingestionRunId: egResult.ingestionRunId,
        errors: egResult.errors.length > 0 ? egResult.errors : undefined,
        timestamp: Date.now(),
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Ingest-EG] error', { reqId, tookMs: Date.now() - startedAt, error: errorMessage });

    return Response.json(
      {
        inserted: 0,
        errors: [{ source: 'EG', error: errorMessage }],
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
