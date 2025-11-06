import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import { z } from 'zod';
import { makeAfipClient } from '@/lib/afipClient';
import { buildAfipQrDataUrl } from '@/lib/qr';
import { buildInvoicePdf } from '@/lib/pdf';
import { DOC_TYPES } from '@/lib/docTypes';
import { resolveAfipCredentials } from '@/lib/credentials';
import { hasValidBasicAuth } from '@/lib/basicAuth';

const AuthSchema = z.object({
  cuit: z.number().int(),
  env: z.enum(['HOMO', 'PROD'])
});

const BodySchema = z.object({
  auth: AuthSchema,
  ptoVta: z.number().int().min(1),
  tipoCbte: z.enum(['A','B','C']).default('C'),
  concepto: z.number().int().min(1).max(3).default(1),
  docTipo: z.number().int().default(99),
  docNro:  z.number().int().default(0),
  items:   z.array(z.object({ desc: z.string(), qty: z.number().positive(), price: z.number().nonnegative() })),
  customer: z
    .object({
      name: z.string().min(1),
      ivaCondition: z.string().min(1),
      documentLabel: z.string().optional(),
      documentNumber: z.string().optional()
    })
    .optional()
});

const tipoToCode: Record<string, number> = { A: 1, B: 6, C: 11 };

export async function POST(req: NextRequest) {
  if (!hasValidBasicAuth(req)) {
    return new NextResponse('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="AFIP"' } });
  }

  try {
    const body = await req.json();
    const data = BodySchema.parse(body);

    const cbteTipo = tipoToCode[data.tipoCbte];
    const credentials = resolveAfipCredentials(data.auth.cuit, data.auth.env);

    const afip = makeAfipClient({
      CUIT: data.auth.cuit,
      production: data.auth.env === 'PROD',
      certPem: credentials.certPem,
      keyPem: credentials.keyPem
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
    const docLabel = DOC_TYPES.find(({ code }) => code === data.docTipo)?.label;

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
      qrDataUrl,
      customer: data.customer
        ? {
            ...data.customer,
            documentLabel: data.customer.documentLabel ?? docLabel,
            documentNumber: data.customer.documentNumber ?? String(data.docNro)
          }
        : docLabel
          ? {
              name: 'Receptor',
              ivaCondition: 'Sin especificar',
              documentLabel: docLabel,
              documentNumber: String(data.docNro)
            }
          : undefined
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
    const status = err?.response?.status ?? err?.status;
    if (status === 401) {
      return NextResponse.json(
        {
          error: true,
          message:
            'AFIP rechazó las credenciales configuradas. Verificá que el certificado y la clave privada correspondan al CUIT y que el servicio WSFE esté habilitado.'
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ error: true, message: err?.message ?? 'Unknown error' }, { status: 400 });
  }
}
