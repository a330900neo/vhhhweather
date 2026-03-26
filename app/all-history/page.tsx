import { sql } from '@vercel/postgres';
import Link from 'next/link';

// Force Next.js to never cache this page
export const dynamic = 'force-dynamic';
export const revalidate = 0; 

export default async function AllHistoryPage({
  searchParams,
}: {
  // Update the type to handle the Promise (Next.js 15 requirement)
  searchParams: Promise<{ page?: string }> | { page?: string }
}) {
  // --- PAGINATION LOGIC ---
  // We must AWAIT the searchParams before using them now
  const params = await searchParams;
  const currentPage = Number(params?.page) || 1;
  const limit = 100; // Shows 100 rows per page
  const offset = (currentPage - 1) * limit;

  // Fetch the total count to calculate total pages
  const { rows: countRows } = await sql`SELECT COUNT(*) FROM aero_data`;
  const totalRecords = Number(countRows[0].count);
  const totalPages = Math.ceil(totalRecords / limit);

  // Fetch exactly 100 rows for the current page
  const { rows } = await sql`
    SELECT id, data_type, raw_text, created_at
    FROM aero_data
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

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
            {rows.map((row) => {
              // Color coding based on type
              let typeColor = '#3b82f6'; // TAF default blue
              if (row.data_type === 'METAR') typeColor = '#4ade80'; 
              if (row.data_type?.includes('ATIS')) typeColor = '#f59e0b'; 

              // Format date strictly to HKT
              const dateObj = new Date(row.created_at);
              const formattedDate = new Intl.DateTimeFormat('en-GB', { 
                timeZone: 'Asia/Hong_Kong', 
                day: '2-digit', 
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit',
                hour12: false 
              }).format(dateObj);

              return (
                <tr key={row.id} style={{ borderBottom: '1px solid #162540' }}>
                  <td style={{ padding: '12px', color: '#88a', whiteSpace: 'nowrap' }}>
                    {formattedDate}
                  </td>
                  <td style={{ padding: '12px', color: typeColor, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {row.data_type}
                  </td>
                  <td style={{ padding: '12px', color: '#ccc', fontSize: '10px', minWidth: '300px', lineHeight: '1.4' }}>
                    {row.raw_text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* PAGINATION CONTROLS (BOTTOM) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', fontSize: '12px' }}>
        {currentPage > 1 ? (
          <Link href={`/all-history?page=${currentPage - 1}`} style={{ padding: '8px 12px', background: '#162540', border: '1px solid #2a3b5a', borderRadius: '4px', color: 'white', textDecoration: 'none' }}>
            « NEWER
          </Link>
        ) : (
          <div style={{ padding: '8px 12px', color: '#556' }}>« NEWER</div>
        )}
        
        {currentPage < totalPages ? (
          <Link href={`/all-history?page=${currentPage + 1}`} style={{ padding: '8px 12px', background: '#162540', border: '1px solid #2a3b5a', borderRadius: '4px', color: 'white', textDecoration: 'none' }}>
            OLDER »
          </Link>
        ) : (
          <div style={{ padding: '8px 12px', color: '#556' }}>OLDER »</div>
        )}
      </div>

    </main>
  );
}
