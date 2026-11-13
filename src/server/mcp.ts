import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { queryFollowUpsForDate } from './sheets.ts';

export const MCP_TOOL_NAME = 'obtener_seguimientos_pendientes';

export function createFollowUpMcpServer(context: {
  accessToken: string;
  defaultSpreadsheetId?: string;
  defaultSheetName?: string;
}): McpServer {
  const server = new McpServer({
    name: 'eightx-seguimientos-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    MCP_TOOL_NAME,
    {
      title: 'Obtener seguimientos pendientes por fecha',
      description:
        'Consulta un Google Sheet con las columnas nombre, próximo_seguimiento y estado, y devuelve todos los contactos con estado "pendiente" cuya fecha de próximo seguimiento es igual o anterior a la fecha consultada (vencidos y pendientes para hoy).',
      inputSchema: {
        fecha: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe('Fecha de referencia en formato ISO YYYY-MM-DD (ej. 2026-11-13)'),
        spreadsheetId: z
          .string()
          .optional()
          .describe('ID del Google Sheet (opcional si se envía por cabecera x-spreadsheet-id)'),
        sheetName: z
          .string()
          .optional()
          .describe('Nombre de la pestaña en el Google Sheet (opcional si se envía por cabecera x-sheet-name)'),
      },
    },
    async ({ fecha, spreadsheetId, sheetName }) => {
      const targetSpreadsheetId = spreadsheetId || context.defaultSpreadsheetId;
      const targetSheetName = sheetName || context.defaultSheetName;

      if (!context.accessToken) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Error: Falta token OAuth de Google Sheets en Authorization: Bearer <token>.',
            },
          ],
        };
      }

      if (!targetSpreadsheetId || !targetSheetName) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Error: Debes especificar spreadsheetId y sheetName (en argumentos o cabeceras x-spreadsheet-id / x-sheet-name).',
            },
          ],
        };
      }

      try {
        const result = await queryFollowUpsForDate(
          context.accessToken,
          targetSpreadsheetId,
          targetSheetName,
          fecha
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error consultando Google Sheets';
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error ejecutando ${MCP_TOOL_NAME}: ${message}`,
            },
          ],
        };
      }
    }
  );

  return server;
}

export async function handleMcpHttpRequest(req: Request, res: Response): Promise<void> {
  const meta = (
    req.body as {
      params?: {
        _meta?: {
          googleAccessToken?: unknown;
          spreadsheetId?: unknown;
          sheetName?: unknown;
        };
      };
    } | undefined
  )?.params?._meta;

  const customToken =
    typeof req.headers['x-google-access-token'] === 'string'
      ? req.headers['x-google-access-token'].trim()
      : '';
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
  const metaToken =
    typeof meta?.googleAccessToken === 'string' ? meta.googleAccessToken.trim() : '';
  const accessToken = customToken || bearerToken || metaToken;

  const defaultSpreadsheetId =
    (typeof req.headers['x-spreadsheet-id'] === 'string'
      ? req.headers['x-spreadsheet-id'].trim()
      : undefined) ||
    (typeof meta?.spreadsheetId === 'string' ? meta.spreadsheetId.trim() : undefined);
  const defaultSheetName =
    (typeof req.headers['x-sheet-name'] === 'string'
      ? req.headers['x-sheet-name'].trim()
      : undefined) ||
    (typeof meta?.sheetName === 'string' ? meta.sheetName.trim() : undefined);

  const mcpServer = createFollowUpMcpServer({
    accessToken,
    defaultSpreadsheetId,
    defaultSheetName,
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    void transport.close();
    void mcpServer.close();
  });

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
