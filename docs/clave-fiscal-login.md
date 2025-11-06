# Flujo de login con Clave Fiscal y gestión de certificados

Las facturas electrónicas del WebService de Facturación (WSFEv1) sólo se pueden
emitir consumiendo el **WSAA** de AFIP con un certificado digital por CUIT.
AFIP no expone un endpoint que permita autenticar con la Clave Fiscal y luego
llamar a WSFE en nombre del usuario sin utilizar un certificado.

Por eso, aunque la interfaz de la aplicación permita a cada persona iniciar
sesión únicamente con su CUIT/Clave Fiscal, el backend que factura necesita
resolver credenciales X.509 para firmar la solicitud.

## Estrategia recomendada

1. **Alta manual única por CUIT**
   - Cada contribuyente debe generar el par `cert.pem` / `key.pem` (HOMO y/o
     PROD) una sola vez desde AFIP. Este paso sigue siendo obligatorio porque es
     el único mecanismo soportado por WSAA.

2. **Vault centralizado de credenciales**
   - Guardá los PEM en un almacén seguro (ej.: AWS Secrets Manager, Google
     Secret Manager, Hashicorp Vault, base de datos cifrada o incluso un bucket
     S3 con KMS).
   - No los subas como variables de entorno a Vercel si querés mantener tu
     infraestructura separada.

3. **Servicio interno de credenciales**
   - Exponé un microservicio (por ejemplo `/internal/credentials`) que, dado un
     CUIT y el entorno (`HOMO`/`PROD`), devuelva el par certificado/clave desde
     el vault. Este servicio debe requerir autenticación fuerte (token mutual
     TLS, JWT firmado, etc.).

4. **Login con Clave Fiscal en la app**
   - Implementá el flujo de Clave Fiscal únicamente para validar que el usuario
     tiene acceso legítimo al CUIT.
   - Una vez autenticado, asociá el CUIT de la sesión con las credenciales que
     están en tu vault y usá `resolveAfipCredentials` para pedirlas a tu
     servicio interno en lugar de leerlas de las variables de entorno.

5. **Cacheo/rotación**
   - Cacheá los PEM en memoria por unos minutos para evitar leer el vault en
     cada request.
   - Agendá un job que avise cuando un certificado esté por vencer, porque la
     renovación sigue siendo manual ante AFIP.

## Cambios necesarios en este proyecto

- Reemplazá `resolveAfipCredentials` en `lib/credentials.ts` para que, en lugar
  de mirar variables de entorno, llame a tu servicio interno con el CUIT de la
  sesión.
- Asegurate de que el endpoint sólo sea accesible desde tu backend (no desde la
  app cliente) y de firmar la petición con una API key o JWT.
- Agregá variables de entorno tipo `CREDENTIAL_SERVICE_URL` y
  `CREDENTIAL_SERVICE_TOKEN` para que Vercel conozca cómo contactar a ese
  servicio sin almacenar los certificados directamente.

## Consideraciones

- No existe un API pública que, dado usuario/clave fiscal, devuelva un
  certificado listo para usar. La Clave Fiscal sirve para autenticarse en la web
  de AFIP y realizar trámites manuales.
- Los certificados tienen vigencia (normalmente 2 años); necesitás un proceso
  para renovarlos y volver a cargarlos en tu vault.
- La autenticación de Clave Fiscal es interactiva (formulario + captcha). Si
  querés automatizarla, deberías usar el flujo oficial de **Autenticación y
  Autorización Centralizada (AAC)** y registrar tu aplicación con AFIP.

Con este esquema, la app puede limitarse a gestionar el inicio de sesión con
Clave Fiscal, mientras que las credenciales X.509 viven fuera de Vercel y sólo
se recuperan cuando el backend necesita emitir una factura.
