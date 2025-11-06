export type DocTypeOption = {
  code: number;
  label: string;
};

export const DOC_TYPES: DocTypeOption[] = [
  { code: 80, label: 'CUIT' },
  { code: 86, label: 'CUIL' },
  { code: 96, label: 'DNI' },
  { code: 99, label: 'Consumidor Final' }
];

export function findDocTypeByLabel(label: string): DocTypeOption | undefined {
  const normalized = label.trim().toLowerCase();
  return DOC_TYPES.find(({ label }) => label.toLowerCase() === normalized);
}

export function sanitizeDocumentNumber(value: string): number {
  const numeric = value.replace(/[^0-9]/g, '');
  const parsed = Number(numeric);
  if (!Number.isFinite(parsed)) {
    throw new Error(`No se pudo interpretar el número de documento: ${value}`);
  }
  return parsed;
}
