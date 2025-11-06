'use client';

import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { DOC_TYPES, DocTypeOption, sanitizeDocumentNumber } from '@/lib/docTypes';

type AuthFormState = {
  cuit: string;
  env: 'HOMO' | 'PROD';
  ptoVta: string;
  tipoCbte: 'A' | 'B' | 'C';
  concepto: '1' | '2' | '3';
};

type ActiveSession = {
  auth: {
    cuit: number;
    env: 'HOMO' | 'PROD';
  };
  ptoVta: number;
  tipoCbte: 'A' | 'B' | 'C';
  concepto: 1 | 2 | 3;
};

type Recipient = {
  id: string;
  fullName: string;
  ivaCondition: string;
  docType: DocTypeOption;
  docNumber: string;
  amount: number;
  description: string;
};

const IVA_OPTIONS = [
  'Responsable Inscripto',
  'Responsable Monotributo',
  'Consumidor Final',
  'Exento',
  'No Responsable'
];

const INITIAL_AUTH_FORM: AuthFormState = {
  cuit: '',
  env: 'HOMO',
  ptoVta: '1',
  tipoCbte: 'C',
  concepto: '1'
};

const INITIAL_MANUAL_RECIPIENT = {
  name: '',
  lastName: '',
  ivaCondition: IVA_OPTIONS[0],
  docType: DOC_TYPES[0].label,
  docNumber: '',
  amount: '',
  description: ''
};

function buildRecipientId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `recipient-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function normalizeKey(key: string) {
  return key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function guessDocType(value: string, hint?: string): DocTypeOption {
  if (hint) {
    const hinted = DOC_TYPES.find(dt => dt.label.toLowerCase() === hint.trim().toLowerCase());
    if (hinted) return hinted;
  }
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length === 11) {
    const cuit = DOC_TYPES.find(dt => dt.label === 'CUIT');
    if (cuit) return cuit;
  }
  if (digits.length === 8) {
    const dni = DOC_TYPES.find(dt => dt.label === 'DNI');
    if (dni) return dni;
  }
  return DOC_TYPES[DOC_TYPES.length - 1];
}

function parseAmount(value: any): number {
  if (typeof value === 'number') return Number(value.toFixed(2));
  const raw = String(value ?? '').trim();
  if (!raw) {
    throw new Error('Monto vacío.');
  }
  let normalized = raw.replace(/\s+/g, '');
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }
  normalized = normalized.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Monto inválido: ${value}`);
  }
  return Number(parsed.toFixed(2));
}

export default function Page() {
  const [authForm, setAuthForm] = useState<AuthFormState>(INITIAL_AUTH_FORM);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [manualRecipient, setManualRecipient] = useState(INITIAL_MANUAL_RECIPIENT);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const selectedRecipient = useMemo(
    () => recipients.find(r => r.id === selectedRecipientId) ?? null,
    [recipients, selectedRecipientId]
  );

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const cleanedCuit = authForm.cuit.replace(/[^0-9]/g, '');
      const parsedCuit = Number(cleanedCuit);
      if (!Number.isFinite(parsedCuit) || cleanedCuit.length !== 11) {
        throw new Error('Ingresá un CUIT válido de 11 dígitos.');
      }
      const parsedPtoVta = Number(authForm.ptoVta);
      if (!Number.isFinite(parsedPtoVta) || parsedPtoVta <= 0) {
        throw new Error('El punto de venta debe ser un número positivo.');
      }

      setStatusMessage('Validando credenciales con AFIP...');

      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuit: parsedCuit,
          env: authForm.env
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message ?? 'No se pudo validar la sesión con AFIP.');
      }

      setSession({
        auth: {
          cuit: parsedCuit,
          env: authForm.env
        },
        ptoVta: parsedPtoVta,
        tipoCbte: authForm.tipoCbte,
        concepto: Number(authForm.concepto) as 1 | 2 | 3
      });
      setStatusMessage('Sesión iniciada correctamente. Ya podés generar comprobantes.');
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'No se pudo iniciar sesión.');
    }
  };

  const handleLogout = () => {
    setSession(null);
    setStatusMessage('Sesión cerrada.');
  };

  const handleExcelUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setErrorMessage(null);
    setStatusMessage(null);
    setImportMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const response = await fetch('/api/import-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, data: base64 })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message ?? `No se pudo procesar ${file.name}`);
      }

      const { rows } = (await response.json()) as { rows: Array<Record<string, any>> };
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('No se encontraron filas en el archivo.');
      }

      const imported: Recipient[] = rows
        .map((row, index) => {
          const normalized = new Map<string, any>();
          Object.entries(row).forEach(([key, value]) => {
            normalized.set(normalizeKey(key), value);
          });

          const nombre = String(
            normalized.get('nombre') ??
              normalized.get('name') ??
              normalized.get('razon social') ??
              ''
          ).trim();
          const apellido = String(
            normalized.get('apellido') ??
              normalized.get('apellidos') ??
              normalized.get('last name') ??
              ''
          ).trim();
          const fullName = [nombre, apellido].filter(Boolean).join(' ').trim() || `Persona ${index + 1}`;

          const docValueRaw = String(
            normalized.get('cuit') ??
              normalized.get('cuit dni') ??
              normalized.get('dni') ??
              normalized.get('documento') ??
              normalized.get('doc') ??
              ''
          ).trim();
          if (!docValueRaw) {
            throw new Error(`Fila ${index + 2}: falta el CUIT o DNI.`);
          }

          const docHint = String(
            normalized.get('tipo documento') ??
              normalized.get('documento tipo') ??
              normalized.get('doc tipo') ??
              ''
          ).trim();
          const docType = guessDocType(docValueRaw, docHint);

          const ivaCondition = String(
            normalized.get('condicion frente al iva') ??
              normalized.get('condicion iva') ??
              normalized.get('iva') ??
              'Consumidor Final'
          ).trim() || 'Consumidor Final';

          const description = String(
            normalized.get('descripcion') ??
              normalized.get('detalle') ??
              normalized.get('concepto') ??
              ''
          ).trim();

          const amountRaw = normalized.get('monto') ?? normalized.get('importe') ?? normalized.get('total');
          if (amountRaw === undefined || amountRaw === null || amountRaw === '') {
            throw new Error(`Fila ${index + 2}: falta el monto.`);
          }
          const amount = parseAmount(amountRaw);

          return {
            id: buildRecipientId(),
            fullName,
            ivaCondition,
            docType,
            docNumber: docValueRaw,
            amount,
            description: description || `Servicios prestados a ${fullName}`
          } satisfies Recipient;
        })
        .filter(Boolean);

      setRecipients(prev => [...prev, ...imported]);
      if (!selectedRecipientId && imported.length) {
        setSelectedRecipientId(imported[0].id);
      }
      setImportMessage(`Se importaron ${imported.length} destinatarios desde "${file.name}".`);
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'No se pudo leer el archivo. Revisá el formato.');
    }
  };

  const handleManualRecipient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const fullName = `${manualRecipient.name} ${manualRecipient.lastName}`.trim();
      if (!fullName) {
        throw new Error('Indicá nombre y apellido de la persona a facturar.');
      }
      if (!manualRecipient.docNumber.trim()) {
        throw new Error('Ingresá el documento (CUIT o DNI).');
      }
      const amount = parseAmount(manualRecipient.amount);
      const docType = guessDocType(manualRecipient.docNumber, manualRecipient.docType);

      const created: Recipient = {
        id: buildRecipientId(),
        fullName,
        ivaCondition: manualRecipient.ivaCondition,
        docType,
        docNumber: manualRecipient.docNumber,
        amount,
        description:
          manualRecipient.description.trim() || `Servicios prestados a ${fullName}`
      };

      setRecipients(prev => [...prev, created]);
      setSelectedRecipientId(created.id);
      setManualRecipient({
        ...INITIAL_MANUAL_RECIPIENT,
        ivaCondition: manualRecipient.ivaCondition,
        docType: docType.label
      });
      setStatusMessage('Destinatario agregado manualmente.');
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'No se pudo crear el destinatario.');
    }
  };

  const handleGenerateInvoice = async () => {
    if (!session || !selectedRecipient) return;
    setErrorMessage(null);
    setStatusMessage('Generando factura...');

    try {
      const payload = {
        auth: session.auth,
        ptoVta: session.ptoVta,
        tipoCbte: session.tipoCbte,
        concepto: session.concepto,
        docTipo: selectedRecipient.docType.code,
        docNro: sanitizeDocumentNumber(selectedRecipient.docNumber),
        items: [
          {
            desc: selectedRecipient.description,
            qty: 1,
            price: selectedRecipient.amount
          }
        ],
        customer: {
          name: selectedRecipient.fullName,
          ivaCondition: selectedRecipient.ivaCondition,
          documentLabel: selectedRecipient.docType.label,
          documentNumber: selectedRecipient.docNumber
        }
      };

      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message ?? `Error ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setStatusMessage(`Factura generada para ${selectedRecipient.fullName}.`);
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'No se pudo generar la factura.');
      setStatusMessage(null);
    }
  };

  const canGenerateInvoice = Boolean(session && selectedRecipient);

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1200,
        margin: '0 auto',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Facturanian – Gestión de Facturas AFIP</h1>
      <p style={{ marginBottom: 24 }}>
        Iniciá sesión con tu CUIT. Las credenciales digitales necesarias para AFIP se administran
        automáticamente en el servidor. Podés cargar destinatarios desde un Excel o ingresarlos
        manualmente para generar facturas con QR automáticamente.
      </p>

      <section
        style={{
          border: '1px solid #e0e0e0',
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          background: '#fafafa'
        }}
      >
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>1. Iniciá sesión</h2>
        <form onSubmit={handleLogin} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 160px' }}>
              CUIT
              <input
                type="text"
                required
                value={authForm.cuit}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setAuthForm({ ...authForm, cuit: event.target.value })
                }
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              />
            </label>
            <label style={{ flex: '1 1 140px' }}>
              Entorno
              <select
                value={authForm.env}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setAuthForm({ ...authForm, env: event.target.value as AuthFormState['env'] })
                }
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              >
                <option value="HOMO">Homologación</option>
                <option value="PROD">Producción</option>
              </select>
            </label>
            <label style={{ flex: '1 1 140px' }}>
              Punto de venta
              <input
                type="number"
                min={1}
                required
                value={authForm.ptoVta}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setAuthForm({ ...authForm, ptoVta: event.target.value })
                }
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              />
            </label>
            <label style={{ flex: '1 1 140px' }}>
              Tipo de comprobante
              <select
                value={authForm.tipoCbte}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setAuthForm({
                    ...authForm,
                    tipoCbte: event.target.value as AuthFormState['tipoCbte']
                  })
                }
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              >
                <option value="A">Factura A</option>
                <option value="B">Factura B</option>
                <option value="C">Factura C</option>
              </select>
            </label>
            <label style={{ flex: '1 1 140px' }}>
              Concepto
              <select
                value={authForm.concepto}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setAuthForm({
                    ...authForm,
                    concepto: event.target.value as AuthFormState['concepto']
                  })
                }
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              >
                <option value="1">Productos</option>
                <option value="2">Servicios</option>
                <option value="3">Productos y Servicios</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="submit"
              style={{
                padding: '10px 18px',
                background: '#0b7285',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer'
              }}
            >
              {session ? 'Actualizar sesión' : 'Iniciar sesión'}
            </button>
            {session && (
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  padding: '10px 18px',
                  background: '#adb5bd',
                  color: '#212529',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Cerrar sesión
              </button>
            )}
            {session && (
              <span style={{ color: '#0b7285', fontWeight: 600 }}>
                Sesión activa para CUIT {session.auth.cuit}
              </span>
            )}
          </div>
        </form>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>2. Cargá tus destinatarios</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ flex: '1 1 320px', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>Importar desde Excel</h3>
            <p style={{ fontSize: 14, marginBottom: 12 }}>
              El archivo debe incluir columnas como <strong>Nombre</strong>, <strong>Apellido</strong>,
              <strong> CUIT/DNI</strong>, <strong>Condición frente al IVA</strong> y <strong>Monto</strong>.
            </p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} />
            {importMessage && (
              <p style={{ marginTop: 12, color: '#0b7285' }}>{importMessage}</p>
            )}
          </div>

          <div style={{ flex: '1 1 320px', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>Agregar manualmente</h3>
            <form onSubmit={handleManualRecipient} style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Nombre"
                  value={manualRecipient.name}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setManualRecipient({ ...manualRecipient, name: event.target.value })
                  }
                  style={{ flex: 1, padding: 8 }}
                  required
                />
                <input
                  type="text"
                  placeholder="Apellido"
                  value={manualRecipient.lastName}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setManualRecipient({ ...manualRecipient, lastName: event.target.value })
                  }
                  style={{ flex: 1, padding: 8 }}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={manualRecipient.ivaCondition}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    setManualRecipient({ ...manualRecipient, ivaCondition: event.target.value })
                  }
                  style={{ flex: 1, padding: 8 }}
                >
                  {IVA_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  value={manualRecipient.docType}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    setManualRecipient({ ...manualRecipient, docType: event.target.value })
                  }
                  style={{ flex: 1, padding: 8 }}
                >
                  {DOC_TYPES.map(option => (
                    <option key={option.code} value={option.label}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                placeholder="CUIT o DNI"
                value={manualRecipient.docNumber}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setManualRecipient({ ...manualRecipient, docNumber: event.target.value })
                }
                style={{ padding: 8 }}
                required
              />
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Monto"
                value={manualRecipient.amount}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setManualRecipient({ ...manualRecipient, amount: event.target.value })
                }
                style={{ padding: 8 }}
                required
              />
              <input
                type="text"
                placeholder="Descripción (opcional)"
                value={manualRecipient.description}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setManualRecipient({ ...manualRecipient, description: event.target.value })
                }
                style={{ padding: 8 }}
              />
              <button
                type="submit"
                style={{
                  padding: '10px 14px',
                  background: '#2b8a3e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Guardar destinatario
              </button>
            </form>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>3. Seleccioná una persona y emití la factura</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ flex: '1 1 360px', maxHeight: 320, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f1f3f5' }}>
                  <th style={{ textAlign: 'left', padding: 8 }}>Nombre</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Documento</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {recipients.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: 12, textAlign: 'center', color: '#868e96' }}>
                      Aún no cargaste destinatarios.
                    </td>
                  </tr>
                ) : (
                  recipients.map(recipient => {
                    const isSelected = recipient.id === selectedRecipientId;
                    return (
                      <tr
                        key={recipient.id}
                        onClick={() => setSelectedRecipientId(recipient.id)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? '#e7f5ff' : 'transparent'
                        }}
                      >
                        <td style={{ padding: 8, borderTop: '1px solid #e9ecef' }}>{recipient.fullName}</td>
                        <td style={{ padding: 8, borderTop: '1px solid #e9ecef' }}>
                          {recipient.docType.label}: {recipient.docNumber}
                        </td>
                        <td style={{ padding: 8, borderTop: '1px solid #e9ecef', textAlign: 'right' }}>
                          ${recipient.amount.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={{ flex: '1 1 320px', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16 }}>
            {selectedRecipient ? (
              <>
                <h3 style={{ fontSize: 18, marginBottom: 8 }}>{selectedRecipient.fullName}</h3>
                <p style={{ marginBottom: 8 }}>
                  {selectedRecipient.docType.label}: {selectedRecipient.docNumber}
                  <br />Condición IVA: {selectedRecipient.ivaCondition}
                </p>
                <label style={{ display: 'block', marginBottom: 12 }}>
                  Concepto a facturar
                  <textarea
                    value={selectedRecipient.description}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      setRecipients(prev =>
                        prev.map(recipient =>
                          recipient.id === selectedRecipient.id
                            ? { ...recipient, description: event.target.value }
                            : recipient
                        )
                      )
                    }
                    rows={3}
                    style={{ width: '100%', padding: 8, marginTop: 4 }}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: 12 }}>
                  Monto
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={selectedRecipient.amount}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const amount = Number(event.target.value);
                      const safeAmount = Number.isFinite(amount)
                        ? Number(amount.toFixed(2))
                        : 0;
                      setRecipients(prev =>
                        prev.map(recipient =>
                          recipient.id === selectedRecipient.id
                            ? { ...recipient, amount: safeAmount }
                            : recipient
                        )
                      );
                    }}
                    style={{ width: '100%', padding: 8, marginTop: 4 }}
                  />
                </label>
                <button
                  type="button"
                  disabled={!canGenerateInvoice}
                  onClick={handleGenerateInvoice}
                  style={{
                    padding: '10px 16px',
                    background: canGenerateInvoice ? '#1864ab' : '#ced4da',
                    color: canGenerateInvoice ? 'white' : '#495057',
                    border: 'none',
                    borderRadius: 6,
                    cursor: canGenerateInvoice ? 'pointer' : 'not-allowed'
                  }}
                >
                  Generar factura PDF
                </button>
              </>
            ) : (
              <p style={{ color: '#868e96' }}>
                Seleccioná un destinatario de la lista para emitir su comprobante.
              </p>
            )}
          </div>
        </div>
      </section>

      {(statusMessage || errorMessage) && (
        <div style={{ padding: 16, borderRadius: 8, background: errorMessage ? '#ffe3e3' : '#d3f9d8', border: '1px solid', borderColor: errorMessage ? '#ffa8a8' : '#69db7c' }}>
          {errorMessage ? (
            <strong style={{ color: '#c92a2a' }}>{errorMessage}</strong>
          ) : (
            <strong style={{ color: '#2b8a3e' }}>{statusMessage}</strong>
          )}
        </div>
      )}
    </main>
  );
}
