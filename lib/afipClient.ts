import Afip from '@afipsdk/afip.js';

export function makeAfipClient(opts: {
  CUIT: number;
  production: boolean;
  certPem: string;
  keyPem: string;
}) {
  return new (Afip as any)({
    CUIT: opts.CUIT,
    production: opts.production,
    cert: opts.certPem,
    key: opts.keyPem
  });
}
