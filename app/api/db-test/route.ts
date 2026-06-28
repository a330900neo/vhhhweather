import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await query('SELECT NOW() as now;');
    return NextResponse.json({ ok: true, now: res.rows[0].now });
  } catch (err: any) {
    console.error('DB connectivity test failed:', err);
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
