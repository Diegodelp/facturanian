import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import { z } from 'zod';
import { makeAfipClient } from '@/lib/afipClient';
import { buildAfipQrDataUrl } from '@/lib/qr';
import { buildInvoicePdf } from '@/lib/pdf';

const AuthSchema = z.object({
  cuit: z.number().int(),
  env: z.enum(['HOMO','PROD']),
  certPem: z.string().min(20),
  keyPem: z.string().min(20)
});

const BodySchema = z.object({
  auth: AuthSchema,
  ptoVta: z.number().int().min(1),
  tipoCbte: z.enum(['A','B','C']).default('C'),
  concepto: z.number().int().min(1).max(3).default(1),
  docTipo: z.number().int().default(99),
  docNro:  z.number().int().default(0),
  items:   z.array(z.object({ desc: z.string(), qty: z.number().positive(), price: z.number().nonnegative() }))
});

const tipoToCode: Record<string, number> = { A: 1, B: 6, C: 11 };

function requireBasicAuth(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return true;
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Basic ')) return false;
  const raw = Buffer.from(header.split(' ')[1], 'base64').toString('utf8');
  const [u, p] = raw.split(':');
  return u === user && p === pass;
}

export async function POST(req: NextRequest) {
  if (!requireBasicAuth(req)) {
    return new NextResponse('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="AFIP"' } });
  }

  try {
    const body = await req.json();
    const data = BodySchema.parse(body);

    const cbteTipo = tipoToCode[data.tipoCbte];
    const afip = makeAfipClient({
      CUIT: data.auth.cuit,
      production: data.auth.env === 'PROD',
      certPem: data.auth.certPem,
      keyPem: data.auth.keyPem
    });

    const last = await (afip as any).ElectronicBilling.getLastVoucher(data.ptoVta, cbteTipo);
    const cbteNro = last + 1;

    const neto = data.items.reduce((s, it) => s + it.qty * it.price, 0);
    const iva21 = (data.tipoCbte === 'A' || data.tipoCbte === 'B') ? Number((neto * 0.21).toFixed(2)) : 0;
    const total = neto + iva21;

    const today = dayjs().format('YYYYMMDD');
    const due = dayjs().add(10, 'day').format('YYYYMMDD');
    const ivaArray = iva21 > 0 ? [{ Id: 5, BaseImp: Number(neto.toFixed(2)), Importe: iva21 }] : [];

    const reqCbte: any = {
      CantReg: 1,
      PtoVta: data.ptoVta,
      CbteTipo: cbteTipo,
      Concepto: data.concepto,
      DocTipo: data.docTipo,
      DocNro:  data.docNro,
      CbteDesde: cbteNro,
      CbteHasta: cbteNro,
      CbteFch: today,
      ImpNeto: Number(neto.toFixed(2)),
      ImpIVA: iva21,
      ImpTotal: Number(total.toFixed(2)),
      ImpTotConc: 0,
      ImpOpEx: 0,
      ImpTrib: 0,
      MonId: 'PES',
      MonCotiz: 1,
      Iva: ivaArray.length ? ivaArray : undefined,
      FchServDesde: data.concepto !== 1 ? today : undefined,
      FchServHasta:  data.concepto !== 1 ? today : undefined,
      FchVtoPago:    data.concepto !== 1 ? due : undefined
    };

    const { CAE, CAEFchVto } = await (afip as any).ElectronicBilling.createVoucher(reqCbte);

    const qrDataUrl = await buildAfipQrDataUrl({
      ver: 1,
      fecha: dayjs().format('YYYY-MM-DD'),
      cuit: data.auth.cuit,
      ptoVta: data.ptoVta,
      tipoCmp: cbteTipo,
      nroCmp: cbteNro,
      importe: Number(total.toFixed(2)),
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: data.docTipo,
      nroDocRec: data.docNro,
      tipoCodAut: 'E',
      codAut: Number(CAE)
    });

    const pdfPath = `/tmp/factura-${cbteTipo}-${data.ptoVta}-${cbteNro}.pdf`;
    await buildInvoicePdf({
      outputPath: pdfPath,
      header: {
        razon: 'Factura Electrónica',
        cuit: String(data.auth.cuit),
        ptoVta: data.ptoVta,
        tipo: data.tipoCbte,
        nro: cbteNro,
        fecha: dayjs().format('DD/MM/YYYY')
      },
      items: data.items,
      totals: { neto, iva: iva21, total },
      cae: CAE,
      caeVto: dayjs(CAEFchVto, 'YYYYMMDD').format('DD/MM/YYYY'),
      qrDataUrl
    });

    const fs = await import('node:fs');
    const file = fs.readFileSync(pdfPath);
    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="factura-${cbteTipo}-${cbteNro}.pdf"`
      }
    });

  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: true, message: err?.message ?? 'Unknown error' }, { status: 400 });
  }
}
