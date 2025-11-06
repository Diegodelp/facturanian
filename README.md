# AFIP Invoice (WSFEv1) – Next.js + Vercel (Updated)

- SDK: `@afipsdk/afip.js`
- Runtime Vercel: `vercel-node@20.0.0`
- Endpoint: `POST /api/invoices`
- PDF + QR AFIP
- Multi-tenant simple: credenciales AFIP en el body del request
- Basic Auth opcional por env vars (`BASIC_AUTH_USER`, `BASIC_AUTH_PASS`)

## Quick start
```bash
npm i
npm run dev
```

## Ejemplo de request
```bash
curl -X POST http://localhost:3000/api/invoices  -H "Content-Type: application/json"  -d @example-payload.json > factura.pdf
```
