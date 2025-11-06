import { inflateRawSync } from 'node:zlib';

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16) || 0)
    )
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10) || 0));
}

function columnLabelToIndex(label: string): number {
  let result = 0;
  for (let i = 0; i < label.length; i++) {
    const charCode = label.charCodeAt(i) - 64; // 'A' => 1
    result = result * 26 + charCode;
  }
  return result - 1;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      return i;
    }
  }
  throw new Error('No se encontró el final del ZIP.');
}

function extractZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);

  let ptr = centralDirectoryOffset;
  for (let i = 0; i < entryCount; i++) {
    const signature = buffer.readUInt32LE(ptr);
    if (signature !== 0x02014b50) {
      throw new Error('Entrada inválida en el ZIP.');
    }
    const compression = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const fileNameLength = buffer.readUInt16LE(ptr + 28);
    const extraLength = buffer.readUInt16LE(ptr + 30);
    const commentLength = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);
    const fileName = buffer
      .slice(ptr + 46, ptr + 46 + fileNameLength)
      .toString('utf8');
    ptr += 46 + fileNameLength + extraLength + commentLength;

    const localSignature = buffer.readUInt32LE(localHeaderOffset);
    if (localSignature !== 0x04034b50) {
      throw new Error('Cabecera local inválida.');
    }
    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);

    let data: Buffer;
    if (compression === 0) {
      data = Buffer.from(compressed);
    } else if (compression === 8) {
      data = inflateRawSync(compressed);
    } else {
      throw new Error(`Compresión no soportada: ${compression}`);
    }

    entries.set(fileName, data);
  }

  return entries;
}

function parseSharedStringsXml(xml: string): string[] {
  const values: string[] = [];
  const siRegex = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siRegex.exec(xml))) {
    const textMatch = match[1].match(/<t[^>]*>([\s\S]*?)<\/t>/);
    const richTextMatches = match[1].match(/<r><t[^>]*>([\s\S]*?)<\/t><\/r>/g);
    if (richTextMatches) {
      const richValue = richTextMatches
        .map(fragment => {
          const inner = fragment.match(/<t[^>]*>([\s\S]*?)<\/t>/);
          return inner ? decodeXml(inner[1]) : '';
        })
        .join('');
      values.push(richValue);
    } else if (textMatch) {
      values.push(decodeXml(textMatch[1]));
    } else {
      values.push('');
    }
  }
  return values;
}

function parseWorksheetXml(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(xml))) {
    const rowCells: string[] = [];
    const cellRegex = /<c[^>]*?r="([A-Z]+)[0-9]+"[^>]*?(?:t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const columnIndex = columnLabelToIndex(cellMatch[1]);
      const cellType = cellMatch[2];
      const cellBody = cellMatch[3];
      const valueMatch = cellBody.match(/<v>([\s\S]*?)<\/v>/);
      const inlineMatch = cellBody.match(/<t[^>]*>([\s\S]*?)<\/t>/);

      let value = '';
      if (valueMatch) {
        value = valueMatch[1];
        if (cellType === 's') {
          const index = Number(value);
          value = sharedStrings[index] ?? '';
        } else {
          value = decodeXml(value);
        }
      } else if (inlineMatch) {
        value = decodeXml(inlineMatch[1]);
      }

      rowCells[columnIndex] = value;
    }
    rows.push(rowCells);
  }

  return rows;
}

function rowsToRecords(rows: string[][]): Array<Record<string, string>> {
  if (!rows.length) return [];
  const header = rows[0].map(cell => (cell ?? '').toString().trim());
  const records: Array<Record<string, string>> = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(cell => !cell || !String(cell).trim())) continue;
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      const safeKey = key || `Columna ${index + 1}`;
      record[safeKey] = row[index] ? row[index].toString() : '';
    });
    records.push(record);
  }
  return records;
}

function parseXlsx(buffer: Buffer): Array<Record<string, string>> {
  const entries = extractZipEntries(buffer);
  const workbookXml = entries.get('xl/workbook.xml');
  if (!workbookXml) {
    throw new Error('El archivo XLSX no contiene workbook.xml');
  }

  const sheetMatch = workbookXml.toString('utf8').match(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/);
  if (!sheetMatch) {
    throw new Error('No se encontró ninguna hoja en el XLSX.');
  }

  const sheetId = sheetMatch[2];
  const relsXml = entries.get('xl/_rels/workbook.xml.rels');
  if (!relsXml) {
    throw new Error('El XLSX no contiene relaciones del workbook.');
  }
  const relMatch = relsXml.toString('utf8').match(new RegExp(`<Relationship[^>]*Id="${sheetId}"[^>]*Target="([^"]+)"`));
  if (!relMatch) {
    throw new Error('No se encontró la hoja seleccionada.');
  }
  const sheetPath = `xl/${relMatch[1].replace(/^\/?/, '')}`;
  const sheetXmlBuffer = entries.get(sheetPath);
  if (!sheetXmlBuffer) {
    throw new Error('El XLSX no contiene los datos de la hoja.');
  }

  const sharedStringsBuffer = entries.get('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsBuffer
    ? parseSharedStringsXml(sharedStringsBuffer.toString('utf8'))
    : [];

  const rows = parseWorksheetXml(sheetXmlBuffer.toString('utf8'), sharedStrings);
  return rowsToRecords(rows);
}

function detectDelimiter(line: string): string {
  const comma = (line.match(/,/g) || []).length;
  const semicolon = (line.match(/;/g) || []).length;
  const tab = (line.match(/\t/g) || []).length;
  if (semicolon > comma && semicolon >= tab) return ';';
  if (tab > comma) return '\t';
  return ',';
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let insideQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(buffer: Buffer): Array<Record<string, string>> {
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/).filter(line => line.trim().length);
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  const rows = lines.map(line => parseDelimitedLine(line, delimiter));
  return rowsToRecords(rows);
}

export function parseSpreadsheet(buffer: Buffer, fileName: string): Array<Record<string, string>> {
  if (/\.csv$/i.test(fileName) || /\.txt$/i.test(fileName)) {
    return parseCsv(buffer);
  }
  if (/\.xlsx$/i.test(fileName) || /\.xlsm$/i.test(fileName)) {
    return parseXlsx(buffer);
  }
  throw new Error('Formato de archivo no soportado. Usá .xlsx o .csv');
}
