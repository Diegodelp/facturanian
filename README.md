# AFIP Invoice (WSFEv1) – Next.js + Vercel

Proyecto mínimo para emitir facturas electrónicas de AFIP (WSFEv1) desde Next.js (App Router) y desplegar en Vercel.
- Autenticación WSAA manejada por `afip.js`
- Emisión de CAE (A/B/C) vía WSFEv1
- Generación de QR AFIP (RG 4892/2020)
- PDF básico (PDFKit)
- Endpoint REST: `POST /api/invoices`

> **Modo multi-tenant (simple):** Cada usuario envía sus credenciales AFIP en el body (CUIT, certPem, keyPem, env, punto de venta).
> Para producción, integra un sistema de autenticación (por ej., Supabase Auth) y guarda/encripta credenciales por cuenta.

## Quick start local
```bash
npm i
npm run dev
```
Luego:
```bash
curl -X POST http://localhost:3000/api/invoices  -H "Content-Type: application/json"  -d @example-payload.json > factura.pdf
```

## Despliegue en Vercel
1. Crea un repo en GitHub/GitLab.
2. Importa en Vercel → Framework **Next.js**.
3. Deploy.

## Seguridad (recomendado)
- Define `BASIC_AUTH_USER` y `BASIC_AUTH_PASS` como variables en Vercel. El endpoint exigirá *Basic Auth*.
- Integra tu sistema de usuarios y guarda certificados cifrados (p. ej. Supabase + KMS).

## Body del POST `/api/invoices`
```jsonc
{
  "auth": {
    "cuit": 20123456789,
    "env": "HOMO",        // HOMO | PROD
    "certPem": "-----BEGIN CERTIFICATE-----\n...",
    "keyPem": "-----BEGIN PRIVATE KEY-----\n..."
  },
  "ptoVta": 1,
  "tipoCbte": "C",         // A | B | C
  "concepto": 1,           // 1=Prod, 2=Serv, 3=Ambos
  "docTipo": 99,           // 99=CF, 80=CUIT, 96=DNI
  "docNro": 0,
  "items": [
    { "desc": "Consulta odontológica", "qty": 1, "price": 15000 }
  ]
}
```
La respuesta es un **PDF** (stream) con QR y el pie de CAE/CAE Vto.

## Notas
- Para A/B, el ejemplo aplica IVA 21% simple. Ajusta alícuotas/percepciones si corresponde.
- Para servicios/ambos, se completan fechas de servicio y vencimiento de pago.
- El TA (ticket de acceso) dura ~12h. `afip.js` lo maneja; en serverless conviene cachear si haces alto volumen.
