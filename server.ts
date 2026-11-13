import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { runFollowUpChat, type ChatHistoryTurn } from './src/server/gemini.ts';
import { handleMcpHttpRequest } from './src/server/mcp.ts';
import {
  createTestSpreadsheet,
  getSpreadsheetMetadata,
  readSheetRows,
  resetTestRows,
  SheetsApiError,
  updateRowStatus,
} from './src/server/sheets.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

function sendApiError(res: Response, err: unknown, fallbackMessage: string): void {
  if (err instanceof SheetsApiError) {
    res.status(err.status).json({
      error: err.message,
      diagnostics: err.diagnostics,
    });
    return;
  }
  const status = (err as { status?: number })?.status || 500;
  res.status(status).json({
    error: err instanceof Error ? err.message : fallbackMessage,
  });
}

function extractBearerToken(req: Request): string | null {
  const customToken = req.headers['x-google-access-token'];
  if (typeof customToken === 'string' && customToken.trim().length > 0) {
    return customToken.trim();
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token.length > 0) return token;
  }
  const bodyToken = (req.body as { accessToken?: unknown } | undefined)?.accessToken;
  if (typeof bodyToken === 'string' && bodyToken.trim().length > 0) {
    return bodyToken.trim();
  }
  return null;
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Live MCP Streamable HTTP endpoint
  app.post('/mcp', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handleMcpHttpRequest(req, res);
    } catch (err) {
      next(err);
    }
  });

  app.get('/mcp', (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Stateless MCP server: send JSON-RPC POST requests to /mcp.',
      },
      id: null,
    });
  });

  // Google Sheets API proxy routes (using user-provided Bearer token)
  app.post('/api/sheets/create-test', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Missing Google OAuth access token.' });
      return;
    }
    try {
      const title =
        typeof req.body?.title === 'string' && req.body.title.trim()
          ? req.body.title.trim()
          : undefined;
      const metadata = await createTestSpreadsheet(token, title);
      const firstTab = metadata.tabs[0]?.title || 'Contactos';
      const sheetData = await readSheetRows(token, metadata.spreadsheetId, firstTab);
      res.json({ metadata, sheetName: firstTab, ...sheetData });
    } catch (err) {
      sendApiError(res, err, 'Failed to create test spreadsheet.');
    }
  });

  app.get('/api/sheets/metadata', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Missing Google OAuth access token.' });
      return;
    }
    const spreadsheetId = String(req.query.spreadsheetId || '').trim();
    if (!spreadsheetId) {
      res.status(400).json({ error: 'spreadsheetId query parameter is required.' });
      return;
    }
    try {
      const metadata = await getSpreadsheetMetadata(token, spreadsheetId);
      res.json(metadata);
    } catch (err) {
      sendApiError(res, err, 'Failed to load spreadsheet metadata.');
    }
  });

  app.get('/api/sheets/rows', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Missing Google OAuth access token.' });
      return;
    }
    const spreadsheetId = String(req.query.spreadsheetId || '').trim();
    const sheetName = String(req.query.sheetName || '').trim();
    if (!spreadsheetId || !sheetName) {
      res.status(400).json({ error: 'spreadsheetId and sheetName query parameters are required.' });
      return;
    }
    try {
      const result = await readSheetRows(token, spreadsheetId, sheetName);
      res.json(result);
    } catch (err) {
      sendApiError(res, err, 'Failed to read spreadsheet rows.');
    }
  });

  app.patch('/api/sheets/row-status', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Missing Google OAuth access token.' });
      return;
    }
    const { spreadsheetId, sheetName, rowIndex, estadoColumnLetter, newStatus } = req.body || {};
    if (
      typeof spreadsheetId !== 'string' ||
      typeof sheetName !== 'string' ||
      typeof rowIndex !== 'number' ||
      typeof estadoColumnLetter !== 'string' ||
      typeof newStatus !== 'string'
    ) {
      res.status(400).json({ error: 'Invalid row status update payload.' });
      return;
    }
    try {
      const updated = await updateRowStatus(
        token,
        spreadsheetId,
        sheetName,
        rowIndex,
        estadoColumnLetter,
        newStatus
      );
      res.json(updated);
    } catch (err) {
      sendApiError(res, err, 'Failed to update row status.');
    }
  });

  app.post('/api/sheets/reset-test', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Missing Google OAuth access token.' });
      return;
    }
    const { spreadsheetId, sheetName } = req.body || {};
    if (typeof spreadsheetId !== 'string' || typeof sheetName !== 'string') {
      res.status(400).json({ error: 'spreadsheetId and sheetName are required.' });
      return;
    }
    try {
      await resetTestRows(token, spreadsheetId, sheetName);
      const sheetData = await readSheetRows(token, spreadsheetId, sheetName);
      res.json(sheetData);
    } catch (err) {
      sendApiError(res, err, 'Failed to reset test rows.');
    }
  });

  // Server-side Gemini function-calling test endpoint -> invokes live /mcp tool
  app.post('/api/chat', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Missing Google OAuth access token.' });
      return;
    }
    const { spreadsheetId, sheetName, referenceDate, message, history } = req.body || {};
    if (
      typeof spreadsheetId !== 'string' ||
      typeof sheetName !== 'string' ||
      typeof referenceDate !== 'string' ||
      typeof message !== 'string'
    ) {
      res.status(400).json({
        error: 'spreadsheetId, sheetName, referenceDate, and message are required.',
      });
      return;
    }
    try {
      const result = await runFollowUpChat({
        accessToken: token,
        spreadsheetId,
        sheetName,
        referenceDate,
        message,
        history: Array.isArray(history) ? (history as ChatHistoryTurn[]) : [],
        serverBaseUrl: `http://127.0.0.1:${PORT}`,
      });
      res.json(result);
    } catch (err) {
      sendApiError(res, err, 'Failed to run chat with MCP tool.');
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Follow-Up MCP Workbench running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
