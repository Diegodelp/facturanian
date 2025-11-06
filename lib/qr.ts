import QRCode from 'qrcode';

/**
 * Genera dataURL PNG del QR AFIP (RG 4892/2020).
 * https://www.afip.gob.ar/fe/qr/
 */
export async function buildAfipQrDataUrl(payload: {
  ver: number;
  fecha: string;     // AAAA-MM-DD
  cuit: number;      // emisor
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: string;    // 'PES'
  ctz: number;       // 1 siempre para PES
  tipoDocRec?: number;
  nroDocRec?: number;
  tipoCodAut?: string; // 'E' para CAE
  codAut?: number;     // CAE
}) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  const url = `https://www.afip.gob.ar/fe/qr/?p=${encodeURIComponent(b64)}`;
  return await QRCode.toDataURL(url, { errorCorrectionLevel: 'M' });
}
