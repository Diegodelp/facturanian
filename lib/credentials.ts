import { Buffer } from 'node:buffer';
import type { AfipEnvironment } from './types';

const ENV_VALUES: AfipEnvironment[] = ['HOMO', 'PROD'];

type CredentialPair = { certPem: string; keyPem: string };
type CredentialRecord = Partial<Record<AfipEnvironment, CredentialPair>>;

type RawCredentialEntry = {
  HOMO?: { cert?: string; certPem?: string; key?: string; keyPem?: string } | null;
  PROD?: { cert?: string; certPem?: string; key?: string; keyPem?: string } | null;
  [env: string]: any;
};

type RawCredentialMap = Record<string, RawCredentialEntry | CredentialPair>;

let cachedMap: Map<string, CredentialRecord> | null = null;
let cachedGlobal: CredentialRecord | null = null;

function decodePem(value: string | undefined | null) {
  if (!value) return null;
  if (value.includes('-----BEGIN')) {
    return value;
  }
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    if (decoded.includes('-----BEGIN')) {
      return decoded;
    }
  } catch (err) {
    console.warn('Failed to base64 decode AFIP credential, using raw value');
  }
  return value;
}

function normalizeCuit(cuit: string | number) {
  const normalized = String(cuit).replace(/[^0-9]/g, '');
  return normalized.length ? normalized : null;
}

function loadCredentialMap() {
  if (cachedMap) {
    return;
  }
  cachedMap = new Map();

  const raw = process.env.AFIP_CREDENTIALS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as RawCredentialMap;
      for (const [cuit, entry] of Object.entries(parsed)) {
        const normalized = normalizeCuit(cuit);
        if (!normalized) continue;
        const record: CredentialRecord = {};

        if ('HOMO' in (entry as RawCredentialEntry) || 'PROD' in (entry as RawCredentialEntry)) {
          const cast = entry as RawCredentialEntry;
          for (const env of ENV_VALUES) {
            const envEntry = cast[env];
            if (!envEntry) continue;
            const cert = decodePem(envEntry.certPem ?? envEntry.cert ?? null);
            const key = decodePem(envEntry.keyPem ?? envEntry.key ?? null);
            if (cert && key) {
              record[env] = { certPem: cert, keyPem: key };
            }
          }
        } else {
          const pair = entry as CredentialPair;
          const cert = decodePem((pair as any).certPem ?? (pair as any).cert ?? null);
          const key = decodePem((pair as any).keyPem ?? (pair as any).key ?? null);
          if (cert && key) {
            record.HOMO = { certPem: cert, keyPem: key };
            record.PROD = { certPem: cert, keyPem: key };
          }
        }

        if (Object.keys(record).length) {
          cachedMap!.set(normalized, record);
        }
      }
    } catch (err) {
      console.error('No se pudo leer AFIP_CREDENTIALS. Asegurate de que tenga un JSON válido.', err);
    }
  }

  cachedGlobal = {};
  const homoCert = decodePem(process.env.AFIP_CERT_PEM_HOMO ?? null);
  const homoKey = decodePem(process.env.AFIP_KEY_PEM_HOMO ?? null);
  const prodCert = decodePem(process.env.AFIP_CERT_PEM_PROD ?? null);
  const prodKey = decodePem(process.env.AFIP_KEY_PEM_PROD ?? null);

  if (homoCert && homoKey) {
    cachedGlobal.HOMO = { certPem: homoCert, keyPem: homoKey };
  }
  if (prodCert && prodKey) {
    cachedGlobal.PROD = { certPem: prodCert, keyPem: prodKey };
  }
}

export function resolveAfipCredentials(cuit: number, env: AfipEnvironment): CredentialPair {
  loadCredentialMap();
  const normalized = normalizeCuit(cuit);
  if (!normalized) {
    throw new Error('CUIT inválido para buscar credenciales.');
  }

  const entry = cachedMap!.get(normalized);
  if (entry?.[env]) {
    return entry[env]!;
  }

  if (cachedGlobal?.[env]) {
    return cachedGlobal[env]!;
  }

  if (entry) {
    throw new Error(`No hay credenciales configuradas para el entorno ${env} del CUIT ${normalized}.`);
  }

  throw new Error(
    `No hay credenciales AFIP cargadas para el CUIT ${normalized}. Configuralas via variables de entorno o AFIP_CREDENTIALS.`
  );
}
