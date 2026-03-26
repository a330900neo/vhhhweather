import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

// Force Next.js to never cache this route
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Get current database size in bytes
    const { rows: sizeRows } = await sql`SELECT pg_database_size(current_database()) as size_bytes`;
    const sizeBytes = Number(sizeRows[0].size_bytes);
    
    // Calculate 0.48 GB in bytes (0.48 * 1024 * 1024 * 1024)
    const MAX_BYTES = 515396075; 
    
    const currentGb = (sizeBytes / 1024 / 1024 / 1024).toFixed(3);

    // 2. Check if we crossed the 0.48 GB warning threshold
    if (sizeBytes > MAX_BYTES) {
      // 3. Delete the oldest 5,000 rows to free up space
      const { rowCount } = await sql`
        DELETE FROM aero_data 
        WHERE id IN (
          SELECT id FROM aero_data 
          ORDER BY created_at ASC 
          LIMIT 5000
        )
      `;
      
      return NextResponse.json({ 
        status: 'CLEANED', 
        sizeBeforeClean: `${currentGb} GB`,
        deletedRows: rowCount,
        message: 'Approaching limit! Deleted oldest records to free up space.'
      });
    }

    // If we are under 0.48 GB, do nothing
    return NextResponse.json({ 
      status: 'SAFE', 
      currentSize: `${currentGb} GB`,
      message: 'Database is well under the 0.48 GB limit. No deletion needed.' 
    });

  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json({ error: 'Failed to check database size' }, { status: 500 });
  }
}
