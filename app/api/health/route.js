/**
 * app/api/health/route.js
 * Health check endpoint
 */

export async function GET() {
  return Response.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
}
