import PDFDocument from 'pdfkit';
import fs from 'node:fs';

export async function buildInvoicePdf({
  outputPath,
  header,
  items,
  totals,
  cae,
  caeVto,
  qrDataUrl,
  customer
}: {
  outputPath: string;
  header: { razon: string; cuit: string; ptoVta: number; tipo: string; nro: number; fecha: string; };
  items: Array<{ desc: string; qty: number; price: number; }>;
  totals: { neto: number; iva: number; total: number; };
  cae: string; caeVto: string;
  qrDataUrl: string;
  customer?: {
    name: string;
    ivaCondition: string;
    documentLabel?: string;
    documentNumber?: string;
  };
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  doc.pipe(fs.createWriteStream(outputPath));

  doc.fontSize(16).text(`${header.razon}`, { align: 'left' });
  doc.fontSize(10).text(`CUIT: ${header.cuit}`);
  doc.text(`P.V.: ${header.ptoVta}  |  Tipo: ${header.tipo}  |  Nro: ${String(header.nro).padStart(8, '0')}`);
  doc.text(`Fecha: ${header.fecha}`);
  doc.moveDown();

  if (customer) {
    doc.fontSize(11).text('Datos del receptor', { underline: true });
    doc.fontSize(10);
    doc.text(customer.name);
    doc.text(`Condición frente al IVA: ${customer.ivaCondition}`);
    if (customer.documentLabel && customer.documentNumber) {
      doc.text(`${customer.documentLabel}: ${customer.documentNumber}`);
    }
    doc.moveDown();
  }

  doc.fontSize(11).text('Detalle', { underline: true });
  items.forEach(it => {
    doc.text(`${it.desc}  x${it.qty}  $${it.price.toFixed(2)}`);
  });

  doc.moveDown();
  doc.text(`Neto: $${totals.neto.toFixed(2)}`);
  doc.text(`IVA: $${totals.iva.toFixed(2)}`);
  doc.fontSize(12).text(`TOTAL: $${totals.total.toFixed(2)}`);

  doc.moveDown();
  doc.fontSize(10).text(`CAE: ${cae}  |  Vto CAE: ${caeVto}`);

  const qr = qrDataUrl.replace(/^data:image\/png;base64,/, '');
  doc.image(Buffer.from(qr, 'base64'), doc.page.width - 36 - 100, doc.page.height - 36 - 100, { width: 100 });

  doc.end();
}
