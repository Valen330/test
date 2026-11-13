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

export interface McpToolTrace {
  toolName: string;
  arguments: Record<string, unknown>;
  mcpRequestPayload: Record<string, unknown>;
  mcpResponsePayload: unknown;
  queryResult: FollowUpQueryResult | null;
  durationMs: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  toolTrace?: McpToolTrace | null;
  error?: string;
}

export interface PendingMutation {
  type: 'row-status' | 'reset-test';
  title: string;
  description: string;
  spreadsheetId: string;
  sheetName: string;
  targetRange: string;
  currentValue: string;
  newValue: string;
  rowIndex?: number;
  estadoColumnLetter?: string;
}

export interface McpTraceHistoryItem {
  id: string;
  timestamp: string;
  source: 'chat' | 'inspector';
  method: string;
  requestPayload: Record<string, unknown>;
  responsePayload: unknown;
  durationMs: number;
}
