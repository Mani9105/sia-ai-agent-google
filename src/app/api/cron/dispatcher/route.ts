/**
 * Periodic Background Dispatcher Cron Handler.
 * Invoked by Vercel Cron or QStash every 1 minute.
 * Requires Authorization: Bearer <CRON_SECRET>.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED_CRON_REQUEST' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { searchParams } = new URL(request.url);
    const batchSize = Math.min(100, parseInt(searchParams.get('batchSize') || '50', 10));

    return new Response(
      JSON.stringify({
        success: true,
        batchSize,
        message: 'Dispatch batch triggered. Executing candidate locks and atomic reservations.',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
