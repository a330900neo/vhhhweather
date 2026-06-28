import { query } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AllHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }> | { page?: string }
}) {
  const params = await searchParams;
  const currentPage = Number(params?.page) || 1;
  const limit = 100;
  const offset = (currentPage - 1) * limit;

  const countRes = await query('SELECT COUNT(*) FROM aero_data');
  const totalRecords = Number(countRes.rows[0].count);
  const totalPages = Math.ceil(totalRecords / limit);

  const rowsRes = await query(
    `SELECT id, data_type, raw_text, created_at
     FROM aero_data
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const rows = rowsRes.rows;

  return (
    <main style={{ padding: '15px', backgroundColor: '#0b162a', color: 'white', minHeight: '100vh', fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
        <Link href="/" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '12px' }}>← DASHBOARD</Link>
        <Link href="/history" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '12px' }}>← CHARTS</Link>
      </div>
      
      <h2 style={{ fontSize: '18px', margin: '0 0 15px 0' }}>VHHH FULL DATABASE ARCHIVE</h2>
      
      <div style={{ fontSize: '12px', color: '#88a', marginBottom: '15px' }}>
        TOTAL RECORDS SAVED: {totalRecords.toLocaleString()}
      </div>

      {/* PAGINATION CONTROLS (TOP) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', fontSize: '12px' }}>
        {currentPage > 1 ? (
          <Link href={`/all-history?page=${currentPage - 1}`} style={{ padding: '8px 12px', background: '#162540', border: '1px solid #2a3b5a', borderRadius: '4px', color: 'white', textDecoration: 'none' }}>
            « NEWER
          </Link>
        ) : (
          <div style={{ padding: '8px 12px', color: '#556' }}>« NEWER</div>
        )}
        
        <div style={{ color: '#88a' }}>PAGE {currentPage} OF {totalPages}</div>

        {currentPage < totalPages ? (
          <Link href={`/all-history?page=${currentPage + 1}`} style={{ padding: '8px 12px', background: '#162540', border: '1px solid #2a3b5a', borderRadius: '4px', color: 'white', textDecoration: 'none' }}>
            OLDER »
          </Link>
        ) : (
          <div style={{ padding: '8px 12px', color: '#556' }}>OLDER »</div>
        )}
      </div>

      {/* DATA TABLE */}
      <div style={{ overflowX: 'auto', background: '#07101e', borderRadius: '4px', border: '1px solid #162540' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #2a3b5a', color: '#556', background: '#111b2d' }}>
              <th style={{ padding: '12px', whiteSpace: 'nowrap' }}>DATE / TIME (HKT)</th>
              <th style={{ padding: '12px' }}>TYPE</th>
              <th style={{ padding: '12px' }}>RAW DATA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any) => {
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid #0f2438' }}>
                  <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>{new Date(row.created_at).toLocaleString('en-HK', { timeZone: 'Asia/Hong_Kong' })}</td>
                  <td style={{ padding: '12px' }}>{row.data_type}</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace' }}>{row.raw_text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
