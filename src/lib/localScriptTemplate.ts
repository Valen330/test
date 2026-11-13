export function generateStandaloneMcpScript(params: {
  spreadsheetId?: string;
  sheetName?: string;
}): string {
  const spreadsheetId = params.spreadsheetId || 'YOUR_SPREADSHEET_ID';
  const sheetName = params.sheetName || 'Contactos';

  return `#!/usr/bin/env node
/**
 * Standalone Node.js MCP Server (stdio) for Google Sheets Follow-Ups
 * Compatible with Claude Code & Claude Desktop
 *
 * Usage:
 *   npm install @modelcontextprotocol/sdk zod
 *   GOOGLE_ACCESS_TOKEN="ya29...." SPREADSHEET_ID="${spreadsheetId}" SHEET_NAME="${sheetName}" node mcp-sheets-server.mjs
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '${spreadsheetId}';
const SHEET_NAME = process.env.SHEET_NAME || '${sheetName}';

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/\\s+/g, '_');
}

async function queryPendingFollowUps(fecha) {
  const token = process.env.GOOGLE_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Missing GOOGLE_ACCESS_TOKEN environment variable.');
  }
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'YOUR_SPREADSHEET_ID') {
    throw new Error('Missing SPREADSHEET_ID environment variable.');
  }

  const safeSheet = \`'\${SHEET_NAME.replace(/'/g, "''")}'\`;
  const range = encodeURIComponent(\`\${safeSheet}!A1:Z200\`);
  const url = \`https://sheets.googleapis.com/v4/spreadsheets/\${encodeURIComponent(SPREADSHEET_ID)}/values/\${range}\`;

  const res = await fetch(url, {
    headers: {
      Authorization: \`Bearer \${token}\`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(\`Google Sheets API error (\${res.status}): \${errText}\`);
  }

  const data = await res.json();
  const values = data.values || [];
  if (values.length === 0) {
    return { fecha_consulta: fecha, total_pendientes: 0, contactos: [] };
  }

  const headers = values[0].map(normalizeHeader);
  const nombreIdx = headers.findIndex((h) => h === 'nombre' || h === 'name');
  const fechaIdx = headers.findIndex((h) => h === 'proximo_seguimiento' || h === 'fecha');
  const estadoIdx = headers.findIndex((h) => h === 'estado' || h === 'status');

  if (nombreIdx === -1 || fechaIdx === -1 || estadoIdx === -1) {
    throw new Error('Expected columns: nombre, próximo_seguimiento, estado');
  }

  const contactos = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const nombre = String(row[nombreIdx] ?? '').trim();
    const proximo = String(row[fechaIdx] ?? '').trim();
    const estado = String(row[estadoIdx] ?? '').trim();

    if (
      estado.toLowerCase() === 'pendiente' &&
      /^\\d{4}-\\d{2}-\\d{2}$/.test(proximo) &&
      proximo <= fecha
    ) {
      contactos.push({
        rowIndex: i + 1,
        nombre,
        proximo_seguimiento: proximo,
        estado,
        urgencia: proximo < fecha ? 'vencido' : 'para_hoy',
      });
    }
  }

  contactos.sort((a, b) => a.proximo_seguimiento.localeCompare(b.proximo_seguimiento));

  return {
    fecha_consulta: fecha,
    spreadsheetId: SPREADSHEET_ID,
    sheetName: SHEET_NAME,
    total_pendientes: contactos.length,
    contactos,
  };
}

const server = new McpServer({
  name: 'eightx-seguimientos-mcp',
  version: '1.0.0',
});

server.registerTool(
  'obtener_seguimientos_pendientes',
  {
    title: 'Obtener seguimientos pendientes por fecha',
    description:
      'Consulta Google Sheets (nombre, próximo_seguimiento, estado) y devuelve los contactos pendientes cuya fecha sea igual o anterior a la fecha consultada.',
    inputSchema: {
      fecha: z
        .string()
        .regex(/^\\d{4}-\\d{2}-\\d{2}$/)
        .describe('Fecha en formato YYYY-MM-DD (ej. 2026-11-13)'),
    },
  },
  async ({ fecha }) => {
    const result = await queryPendingFollowUps(fecha);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
`;
}

export function generateClaudeConfigSnippet(params: {
  spreadsheetId?: string;
  sheetName?: string;
}): string {
  const spreadsheetId = params.spreadsheetId || 'YOUR_SPREADSHEET_ID';
  const sheetName = params.sheetName || 'Contactos';

  return JSON.stringify(
    {
      mcpServers: {
        seguimientos: {
          command: 'node',
          args: ['/absolute/path/to/mcp-sheets-server.mjs'],
          env: {
            SPREADSHEET_ID: spreadsheetId,
            SHEET_NAME: sheetName,
            GOOGLE_ACCESS_TOKEN: 'PASTE_YOUR_OAUTH_ACCESS_TOKEN',
          },
        },
      },
    },
    null,
    2
  );
}
