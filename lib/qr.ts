import QRCode from 'qrcode';

export async function buildAfipQrDataUrl(payload: {
  ver: number;
  fecha: string;
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: string;
  ctz: number;
  tipoDocRec?: number;
  nroDocRec?: number;
  tipoCodAut?: string;
  codAut?: number;
}) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  const url = `https://www.afip.gob.ar/fe/qr/?p=${encodeURIComponent(b64)}`;
  return await QRCode.toDataURL(url, { errorCorrectionLevel: 'M' });
}
