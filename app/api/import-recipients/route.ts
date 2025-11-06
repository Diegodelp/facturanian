import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseSpreadsheet } from '@/lib/excel';

const ImportSchema = z.object({
  fileName: z.string().min(3),
  data: z.string().min(10)
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { fileName, data } = ImportSchema.parse(json);
    const buffer = Buffer.from(data, 'base64');
    const rows = parseSpreadsheet(buffer, fileName);
    return NextResponse.json({ rows });
  } catch (err: any) {
    console.error('import-recipients error', err);
    return NextResponse.json(
      { error: true, message: err?.message ?? 'No se pudo interpretar el archivo.' },
      { status: 400 }
    );
  }
}
