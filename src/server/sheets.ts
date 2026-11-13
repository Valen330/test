export interface ContactRow {
  rowIndex: number;
  nombre: string;
  proximo_seguimiento: string;
  estado: string;
}

export interface SheetTab {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  tabs: SheetTab[];
}

export interface SheetReadResult {
  headers: string[];
  estadoColumnLetter: string;
  rows: ContactRow[];
}

export interface FollowUpContact extends ContactRow {
  urgencia: 'vencido' | 'para_hoy';
  dias_retraso: number;
}

export interface FollowUpQueryResult {
  fecha_consulta: string;
  spreadsheetId: string;
  sheetName: string;
  total_pendientes: number;
  contactos: FollowUpContact[];
}

const SHEETS_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

export const SEED_HEADERS = ['nombre', 'próximo_seguimiento', 'estado'];
export const SEED_ROWS = [
  ['Ana', '2026-11-12', 'pendiente'],
  ['Bruno', '2026-11-13', 'pendiente'],
  ['Carla', '2026-11-13', 'hecho'],
];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function columnIndexToLetter(index: number): string {
  let col = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

function computeDaysDiff(targetDate: string, dueDate: string): number {
  const targetMs = Date.parse(`${targetDate}T00:00:00Z`);
  const dueMs = Date.parse(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(targetMs) || Number.isNaN(dueMs)) return 0;
  return Math.round((targetMs - dueMs) / (1000 * 60 * 60 * 24));
}

export interface SheetsUpstreamDiagnostics {
  status: number;
  statusText: string;
  finalUrl: string;
  redirected: boolean;
  contentType: string;
  bodyPreview?: string;
}

export class SheetsApiError extends Error {
  status: number;
  diagnostics: SheetsUpstreamDiagnostics;

  constructor(message: string, diagnostics: SheetsUpstreamDiagnostics) {
    super(message);
    this.name = 'SheetsApiError';
    this.status = diagnostics.status;
    this.diagnostics = diagnostics;
  }
}

async function googleSheetsFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const contentType = res.headers.get('content-type') || '(missing)';
  const finalUrl = res.url || url;
  const text = await res.text();
  let data: unknown = null;
  let jsonParseFailed = false;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
    jsonParseFailed = true;
  }

  if (!res.ok || jsonParseFailed) {
    const errObj = data as { error?: { message?: string; status?: string; code?: number } } | null;
    const message =
      errObj?.error?.message ||
      (jsonParseFailed
        ? `Google Sheets returned non-JSON (${contentType}) with HTTP ${res.status}`
        : `Google Sheets API error (${res.status})`);
    throw new SheetsApiError(message, {
      status: res.status || 502,
      statusText: res.statusText,
      finalUrl,
      redirected: res.redirected,
      contentType,
      bodyPreview: text.replace(/\s+/g, ' ').trim().slice(0, 240),
    });
  }

  return data as T;
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }
  return trimmed;
}

export async function createTestSpreadsheet(
  accessToken: string,
  title = 'Seguimientos Eightx - Practice'
): Promise<SpreadsheetMetadata> {
  const created = await googleSheetsFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties: { title: string };
    sheets: Array<{
      properties: {
        sheetId: number;
        title: string;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }>;
  }>(SHEETS_BASE_URL, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        title,
        locale: 'es_ES',
      },
      sheets: [
        {
          properties: {
            title: 'Contactos',
          },
        },
      ],
    }),
  });

  const tabName = created.sheets?.[0]?.properties?.title || 'Contactos';
  const rawRange = `'${tabName.replace(/'/g, "''")}'!A1:C4`;
  const range = encodeURIComponent(rawRange);

  await googleSheetsFetch(
    `${SHEETS_BASE_URL}/${created.spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        range: rawRange,
        majorDimension: 'ROWS',
        values: [SEED_HEADERS, ...SEED_ROWS],
      }),
    }
  );

  return {
    spreadsheetId: created.spreadsheetId,
    title: created.properties?.title || title,
    spreadsheetUrl:
      created.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${created.spreadsheetId}/edit`,
    tabs: (created.sheets || []).map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      rowCount: s.properties.gridProperties?.rowCount ?? 1000,
      columnCount: s.properties.gridProperties?.columnCount ?? 26,
    })),
  };
}

export async function getSpreadsheetMetadata(
  accessToken: string,
  spreadsheetIdOrUrl: string
): Promise<SpreadsheetMetadata> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const data = await googleSheetsFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties: { title: string };
    sheets: Array<{
      properties: {
        sheetId: number;
        title: string;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }>;
  }>(
    `${SHEETS_BASE_URL}/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,gridProperties)`,
    accessToken
  );

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Untitled Spreadsheet',
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    tabs: (data.sheets || []).map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      rowCount: s.properties.gridProperties?.rowCount ?? 1000,
      columnCount: s.properties.gridProperties?.columnCount ?? 26,
    })),
  };
}

export async function readSheetRows(
  accessToken: string,
  spreadsheetIdOrUrl: string,
  sheetName: string
): Promise<SheetReadResult> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const range = encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'!A1:Z200`);
  const data = await googleSheetsFetch<{
    range: string;
    values?: string[][];
  }>(`${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values/${range}`, accessToken);

  const values = data.values || [];
  if (values.length === 0) {
    return {
      headers: [],
      estadoColumnLetter: 'C',
      rows: [],
    };
  }

  const rawHeaders = values[0].map((h) => String(h ?? '').trim());
  const normalized = rawHeaders.map(normalizeHeader);

  const nombreIdx = normalized.findIndex((h) => h === 'nombre' || h === 'name' || h === 'contacto');
  const fechaIdx = normalized.findIndex(
    (h) =>
      h === 'proximo_seguimiento' ||
      h === 'seguimiento' ||
      h === 'fecha' ||
      h === 'next_followup' ||
      h === 'due_date'
  );
  const estadoIdx = normalized.findIndex((h) => h === 'estado' || h === 'status');

  if (nombreIdx === -1 || fechaIdx === -1 || estadoIdx === -1) {
    throw new Error(
      `Expected columns "nombre", "próximo_seguimiento", and "estado" in tab "${sheetName}". Found: ${
        rawHeaders.join(', ') || '(empty)'
      }`
    );
  }

  const rows: ContactRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const nombre = String(row[nombreIdx] ?? '').trim();
    const proximo = String(row[fechaIdx] ?? '').trim();
    const estado = String(row[estadoIdx] ?? '').trim();
    if (!nombre && !proximo && !estado) continue;

    rows.push({
      rowIndex: i + 1,
      nombre,
      proximo_seguimiento: proximo,
      estado,
    });
  }

  return {
    headers: rawHeaders,
    estadoColumnLetter: columnIndexToLetter(estadoIdx),
    rows,
  };
}

export async function updateRowStatus(
  accessToken: string,
  spreadsheetIdOrUrl: string,
  sheetName: string,
  rowIndex: number,
  estadoColumnLetter: string,
  newStatus: string
): Promise<{ updatedRange: string; newStatus: string }> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const safeSheet = `'${sheetName.replace(/'/g, "''")}'`;
  const targetRange = `${safeSheet}!${estadoColumnLetter}${rowIndex}`;
  const encodedRange = encodeURIComponent(targetRange);

  await googleSheetsFetch(
    `${SHEETS_BASE_URL}/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        range: targetRange,
        majorDimension: 'ROWS',
        values: [[newStatus]],
      }),
    }
  );

  return {
    updatedRange: `${sheetName}!${estadoColumnLetter}${rowIndex}`,
    newStatus,
  };
}

export async function resetTestRows(
  accessToken: string,
  spreadsheetIdOrUrl: string,
  sheetName: string
): Promise<void> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const safeSheet = `'${sheetName.replace(/'/g, "''")}'`;
  const clearRange = encodeURIComponent(`${safeSheet}!A1:C50`);

  await googleSheetsFetch(
    `${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values/${clearRange}:clear`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({}),
    }
  );

  const writeRange = encodeURIComponent(`${safeSheet}!A1:C4`);
  await googleSheetsFetch(
    `${SHEETS_BASE_URL}/${encodeURIComponent(
      spreadsheetId
    )}/values/${writeRange}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        range: `${safeSheet}!A1:C4`,
        majorDimension: 'ROWS',
        values: [SEED_HEADERS, ...SEED_ROWS],
      }),
    }
  );
}

export async function queryFollowUpsForDate(
  accessToken: string,
  spreadsheetIdOrUrl: string,
  sheetName: string,
  fecha: string
): Promise<FollowUpQueryResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error(`Invalid date format "${fecha}". Expected YYYY-MM-DD.`);
  }

  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const { rows } = await readSheetRows(accessToken, spreadsheetId, sheetName);

  const contactos: FollowUpContact[] = rows
    .filter((row) => {
      const isPending = row.estado.trim().toLowerCase() === 'pendiente';
      const dueDate = row.proximo_seguimiento.trim();
      const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDate);
      return isPending && isValidDate && dueDate <= fecha;
    })
    .map((row): FollowUpContact => {
      const dueDate = row.proximo_seguimiento.trim();
      const isOverdue = dueDate < fecha;
      const urgencia: FollowUpContact['urgencia'] = isOverdue ? 'vencido' : 'para_hoy';
      return {
        ...row,
        urgencia,
        dias_retraso: Math.max(0, computeDaysDiff(fecha, dueDate)),
      };
    })
    .sort((a, b) => a.proximo_seguimiento.localeCompare(b.proximo_seguimiento));

  return {
    fecha_consulta: fecha,
    spreadsheetId,
    sheetName,
    total_pendientes: contactos.length,
    contactos,
  };
}
