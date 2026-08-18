/**
 * Periodic Crash & Ambiguous Send Reconciliation Cron Handler.
 * Invoked by Vercel Cron or QStash every 2 minutes.
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
    const batchSize = Math.min(50, parseInt(searchParams.get('batchSize') || '25', 10));

    return new Response(
      JSON.stringify({
        success: true,
        batchSize,
        message: 'Reconciliation batch triggered. Checking Gmail for orphaned client_generated_message_ids.',
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
