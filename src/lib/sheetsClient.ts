import { DetailedHttpError, fetchJsonWithDiagnostics } from './http';
import type { ContactRow, SpreadsheetMetadata } from '../types/workbench';

const SHEETS_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

async function sheetsFetchWithTokenDiagnostics<T>(
  accessToken: string,
  url: string,
  init: RequestInit
): Promise<T> {
  try {
    return await fetchJsonWithDiagnostics<T>(url, init);
  } catch (err) {
    if (err instanceof DetailedHttpError && (err.status === 401 || err.status === 403)) {
      try {
        const infoRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
        );
        if (infoRes.ok) {
          const info = (await infoRes.json()) as { scope?: string; email?: string };
          err.diagnostics.grantedScopes = info.scope || '(none)';
          if (info.email) {
            err.diagnostics.tokenEmail = info.email;
          }
        }
      } catch {
        // Best-effort diagnostic lookup only
      }
    }
    throw err;
  }
}

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

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }
  return trimmed;
}

export async function createPracticeSpreadsheetClient(
  accessToken: string,
  title = 'Seguimientos Eightx - Practice'
): Promise<{
  metadata: SpreadsheetMetadata;
  sheetName: string;
  headers: string[];
  estadoColumnLetter: string;
  rows: ContactRow[];
}> {
  const created = await sheetsFetchWithTokenDiagnostics<{
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
  }>(accessToken, SHEETS_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: 'Contactos' } }],
    }),
  });

  const tabName = created.sheets?.[0]?.properties?.title || 'Contactos';
  const rawRange = `'${tabName.replace(/'/g, "''")}'!A1:C4`;
  const range = encodeURIComponent(rawRange);

  await sheetsFetchWithTokenDiagnostics(
    accessToken,
    `${SHEETS_BASE_URL}/${encodeURIComponent(
      created.spreadsheetId
    )}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: rawRange,
        majorDimension: 'ROWS',
        values: [SEED_HEADERS, ...SEED_ROWS],
      }),
    }
  );

  const metadata: SpreadsheetMetadata = {
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

  const sheetData = await readSheetRowsClient(accessToken, metadata.spreadsheetId, tabName);
  return {
    metadata,
    sheetName: tabName,
    ...sheetData,
  };
}

export async function getSpreadsheetMetadataClient(
  accessToken: string,
  spreadsheetIdOrUrl: string
): Promise<SpreadsheetMetadata> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const data = await sheetsFetchWithTokenDiagnostics<{
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
    accessToken,
    `${SHEETS_BASE_URL}/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,gridProperties)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
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

export async function readSheetRowsClient(
  accessToken: string,
  spreadsheetIdOrUrl: string,
  sheetName: string
): Promise<{
  headers: string[];
  estadoColumnLetter: string;
  rows: ContactRow[];
}> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const range = encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'!A1:Z200`);
  const data = await sheetsFetchWithTokenDiagnostics<{
    range: string;
    values?: string[][];
  }>(accessToken, `${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values/${range}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

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

export async function updateRowStatusClient(
  accessToken: string,
  spreadsheetIdOrUrl: string,
  sheetName: string,
  rowIndex: number,
  estadoColumnLetter: string,
  newStatus: string
): Promise<void> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const safeSheet = `'${sheetName.replace(/'/g, "''")}'`;
  const targetRange = `${safeSheet}!${estadoColumnLetter}${rowIndex}`;
  const encodedRange = encodeURIComponent(targetRange);

  await sheetsFetchWithTokenDiagnostics(
    accessToken,
    `${SHEETS_BASE_URL}/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: targetRange,
        majorDimension: 'ROWS',
        values: [[newStatus]],
      }),
    }
  );
}

export async function resetTestRowsClient(
  accessToken: string,
  spreadsheetIdOrUrl: string,
  sheetName: string
): Promise<{
  headers: string[];
  estadoColumnLetter: string;
  rows: ContactRow[];
}> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const safeSheet = `'${sheetName.replace(/'/g, "''")}'`;
  const clearRange = encodeURIComponent(`${safeSheet}!A1:C50`);

  await sheetsFetchWithTokenDiagnostics(
    accessToken,
    `${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values/${clearRange}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );

  const writeRange = encodeURIComponent(`${safeSheet}!A1:C4`);
  await sheetsFetchWithTokenDiagnostics(
    accessToken,
    `${SHEETS_BASE_URL}/${encodeURIComponent(
      spreadsheetId
    )}/values/${writeRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `${safeSheet}!A1:C4`,
        majorDimension: 'ROWS',
        values: [SEED_HEADERS, ...SEED_ROWS],
      }),
    }
  );

  return readSheetRowsClient(accessToken, spreadsheetId, sheetName);
}
