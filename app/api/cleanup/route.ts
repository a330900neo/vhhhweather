import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sizeRes = await query('SELECT pg_database_size(current_database()) as size_bytes');
    const sizeBytes = Number(sizeRes.rows[0].size_bytes);
    
    const MAX_BYTES = 515396075; 
    const currentGb = (sizeBytes / 1024 / 1024 / 1024).toFixed(3);

    if (sizeBytes > MAX_BYTES) {
      const delRes = await query(`
        DELETE FROM aero_data 
        WHERE id IN (
          SELECT id FROM aero_data 
          ORDER BY created_at ASC 
          LIMIT 500
        )
      `);
      
      return NextResponse.json({ 
        status: 'CLEANED', 
        sizeBeforeClean: `${currentGb} GB`,
        deletedRows: delRes.rowCount,
        message: 'Gently trimmed the oldest 500 records to maintain space.'
      });
    }

    return NextResponse.json({ 
      status: 'SAFE', 
      currentSize: `${currentGb} GB`,
      message: 'Database size is safe. No deletion needed.' 
    });

  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json({ error: 'Failed to check database size' }, { status: 500 });
  }
}
