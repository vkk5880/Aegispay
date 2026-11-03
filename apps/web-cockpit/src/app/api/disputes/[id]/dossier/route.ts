import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mockPdfBytes = Buffer.from(`%PDF-1.4\n%Forensic Dossier for ${id}\n%%EOF`).toString('base64');
  return NextResponse.json({
    status: 'SUCCESS',
    dispute_id: id,
    compiled_evidence_pdf_base64: mockPdfBytes,
    dossier_url: `https://storage.aegispay.dev/dossiers/${id}.pdf`,
    generated_at: new Date().toISOString(),
    pages: 3,
    content_type: 'application/pdf',
  });
}
