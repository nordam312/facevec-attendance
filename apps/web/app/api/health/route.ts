import { NextResponse } from 'next/server';

// Liveness probe consumed by the Docker HEALTHCHECK. Static so it never touches
// upstream services.
export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({ status: 'ok', service: 'web' });
}
