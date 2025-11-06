import Afip from 'afip.js';

export function makeAfipClient(opts: {
  CUIT: number;
  production: boolean;
  certPem: string;
  keyPem: string;
}) {
  return new Afip({
    CUIT: opts.CUIT,
    production: opts.production,
    cert: opts.certPem,
    key: opts.keyPem
  });
}
