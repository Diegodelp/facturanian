import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAfipCredentials } from '@/lib/credentials';
import { hasValidBasicAuth } from '@/lib/basicAuth';
import { makeAfipClient } from '@/lib/afipClient';

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
    const credentials = resolveAfipCredentials(payload.cuit, payload.env);
    const client = makeAfipClient({
      CUIT: payload.cuit,
      production: payload.env === 'PROD',
      certPem: credentials.certPem,
      keyPem: credentials.keyPem
    });

    await (client as any).ElectronicBilling.getServerStatus();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = err?.response?.status ?? err?.status;
    const message =
      status === 401
        ? 'AFIP rechazó las credenciales configuradas para este CUIT. Confirmá que el certificado tenga acceso al servicio WSFE.'
        : err?.message ?? 'No se pudo iniciar sesión.';

    return NextResponse.json({ error: true, message }, { status: status === 401 ? 502 : 400 });
  }
}
