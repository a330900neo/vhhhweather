import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Get current database size
    const { rows: sizeRows } = await sql`SELECT pg_database_size(current_database()) as size_bytes`;
    const sizeBytes = Number(sizeRows[0].size_bytes);
    
    // 0.48 GB threshold
    const MAX_BYTES = 515396075; 
    const currentGb = (sizeBytes / 1024 / 1024 / 1024).toFixed(3);

    // 2. Check threshold
    if (sizeBytes > MAX_BYTES) {
      // 3. Just nibble the oldest 500 rows to gently free up space
      const { rowCount } = await sql`
        DELETE FROM aero_data 
        WHERE id IN (
          SELECT id FROM aero_data 
          ORDER BY created_at ASC 
          LIMIT 500
        )
      `;
      
      return NextResponse.json({ 
        status: 'CLEANED', 
        sizeBeforeClean: `${currentGb} GB`,
        deletedRows: rowCount,
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
