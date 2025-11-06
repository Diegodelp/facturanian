import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAfipCredentials } from '@/lib/credentials';
import { hasValidBasicAuth } from '@/lib/basicAuth';

const BodySchema = z.object({
  cuit: z.number().int(),
  env: z.enum(['HOMO', 'PROD'])
});

export async function POST(req: NextRequest) {
  if (!hasValidBasicAuth(req)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="AFIP"' }
    });
  }

  try {
    const payload = BodySchema.parse(await req.json());
    resolveAfipCredentials(payload.cuit, payload.env);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message ?? 'No se pudo iniciar sesión.';
    return NextResponse.json({ error: true, message }, { status: 400 });
  }
}
