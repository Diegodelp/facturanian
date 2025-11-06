# AFIP Invoice (WSFEv1) – Next.js + Vercel (Updated)

- SDK: `@afipsdk/afip.js`
- Runtime Vercel: `vercel-node@20.0.0`
- Endpoint: `POST /api/invoices`
- PDF + QR AFIP
- Multi-tenant simple: credenciales AFIP gestionadas automáticamente desde variables de entorno
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

## Configuración de credenciales AFIP

Definí las credenciales en variables de entorno para que los usuarios no tengan que cargarlas
manualmente:

- `AFIP_CERT_PEM_HOMO` / `AFIP_KEY_PEM_HOMO` para Homologación.
- `AFIP_CERT_PEM_PROD` / `AFIP_KEY_PEM_PROD` para Producción.

Si necesitás múltiples CUIT, podés usar `AFIP_CREDENTIALS` con el siguiente formato JSON
(también puede estar codificado en base64):

```json
{
  "20123456789": {
    "HOMO": { "certPem": "-----BEGIN...", "keyPem": "-----BEGIN..." },
    "PROD": { "certPem": "-----BEGIN...", "keyPem": "-----BEGIN..." }
  },
  "23222333449": {
    "PROD": { "cert": "-----BEGIN...", "key": "-----BEGIN..." }
  }
}
```

La API tomará automáticamente las credenciales correspondientes según el CUIT y entorno enviados
en el body del request o desde la interfaz.
