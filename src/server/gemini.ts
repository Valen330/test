import { GoogleGenAI, Type, type Content, type FunctionDeclaration } from '@google/genai';
import { MCP_TOOL_NAME } from './mcp.ts';
import type { FollowUpQueryResult } from './sheets.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const followUpToolDeclaration: FunctionDeclaration = {
  name: MCP_TOOL_NAME,
  description:
    'Consulta el Google Sheet de seguimientos para devolver los contactos con estado "pendiente" cuya fecha de próximo seguimiento es igual o anterior a la fecha indicada (YYYY-MM-DD).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      fecha: {
        type: Type.STRING,
        description: 'Fecha de referencia en formato YYYY-MM-DD (por ejemplo 2026-11-13).',
      },
    },
    required: ['fecha'],
  },
};

export interface ChatHistoryTurn {
  role: 'user' | 'model';
  text: string;
}

export interface McpToolTrace {
  toolName: string;
  arguments: Record<string, unknown>;
  mcpRequestPayload: Record<string, unknown>;
  mcpResponsePayload: unknown;
  queryResult: FollowUpQueryResult | null;
  durationMs: number;
}

async function callLiveMcpEndpoint(params: {
  serverBaseUrl: string;
  accessToken: string;
  spreadsheetId: string;
  sheetName: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}): Promise<{
  mcpRequestPayload: Record<string, unknown>;
  mcpResponsePayload: unknown;
  queryResult: FollowUpQueryResult | null;
}> {
  const mcpRequestPayload = {
    jsonrpc: '2.0',
    id: `call-${Date.now()}`,
    method: 'tools/call',
    params: {
      name: params.toolName,
      arguments: params.toolArgs,
    },
  };

  const response = await fetch(`${params.serverBaseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'x-google-access-token': params.accessToken,
      'x-spreadsheet-id': params.spreadsheetId,
      'x-sheet-name': params.sheetName,
    },
    body: JSON.stringify(mcpRequestPayload),
  });

  const rawText = await response.text();
  let mcpResponsePayload: unknown;
  try {
    mcpResponsePayload = JSON.parse(rawText);
  } catch {
    mcpResponsePayload = { raw: rawText };
  }

  if (!response.ok) {
    throw new Error(`MCP endpoint returned HTTP ${response.status}: ${rawText}`);
  }

  let queryResult: FollowUpQueryResult | null = null;
  const rpcResult = (mcpResponsePayload as {
    result?: { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    error?: { message?: string };
  }) || {};

  if (rpcResult.error?.message) {
    throw new Error(rpcResult.error.message);
  }

  const firstText = rpcResult.result?.content?.[0]?.text;
  if (rpcResult.result?.isError) {
    throw new Error(firstText || 'MCP tool execution failed');
  }

  if (firstText) {
    try {
      queryResult = JSON.parse(firstText) as FollowUpQueryResult;
    } catch {
      queryResult = null;
    }
  }

  return {
    mcpRequestPayload,
    mcpResponsePayload,
    queryResult,
  };
}

async function generateWithRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('429') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('RESOURCE_EXHAUSTED');
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }
  throw lastError;
}

export async function runFollowUpChat(params: {
  accessToken: string;
  spreadsheetId: string;
  sheetName: string;
  referenceDate: string;
  message: string;
  history?: ChatHistoryTurn[];
  serverBaseUrl: string;
}): Promise<{
  reply: string;
  toolTrace: McpToolTrace | null;
}> {
  const ai = getAiClient();
  const model = 'gemini-4-hydrogen';

  const systemInstruction = [
    `Eres un asistente ejecutivo que responde preguntas sobre seguimientos comerciales usando exclusivamente la herramienta MCP "${MCP_TOOL_NAME}" conectada a Google Sheets.`,
    `La fecha actual de referencia es ${params.referenceDate}.`,
    `Siempre que el usuario pregunte a quién le tiene que escribir hoy o pida revisar pendientes/vencidos, llama primero a "${MCP_TOOL_NAME}" pasando fecha="${params.referenceDate}" (a menos que el usuario indique otra fecha explícita).`,
    `Responde en el mismo idioma del usuario de forma clara y directa, diferenciando entre contactos vencidos (urgencia "vencido") y los que tocan hoy (urgencia "para_hoy"), y sin inventar contactos que no vengan en la respuesta de la herramienta.`,
  ].join(' ');

  const contents: Content[] = [
    ...(params.history || []).map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    {
      role: 'user',
      parts: [{ text: params.message }],
    },
  ];

  const response1 = await generateWithRetry(() =>
    ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [followUpToolDeclaration] }],
      },
    })
  );

  const previousContent = response1.candidates?.[0]?.content;
  const functionCalls = response1.functionCalls;
  const firstCall = functionCalls?.[0];

  if (!firstCall || !previousContent) {
    return {
      reply: response1.text || 'No se recibió respuesta del modelo.',
      toolTrace: null,
    };
  }

  const requestedFecha =
    typeof firstCall.args?.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(firstCall.args.fecha)
      ? firstCall.args.fecha
      : params.referenceDate;

  const toolArgs = { fecha: requestedFecha };
  const startedAt = Date.now();
  const mcpCall = await callLiveMcpEndpoint({
    serverBaseUrl: params.serverBaseUrl,
    accessToken: params.accessToken,
    spreadsheetId: params.spreadsheetId,
    sheetName: params.sheetName,
    toolName: firstCall.name || MCP_TOOL_NAME,
    toolArgs,
  });
  const durationMs = Date.now() - startedAt;

  const response2 = await generateWithRetry(() =>
    ai.models.generateContent({
      model,
      contents: [
        ...contents,
        previousContent,
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: firstCall.id,
                name: firstCall.name || MCP_TOOL_NAME,
                response: {
                  result: mcpCall.queryResult ?? mcpCall.mcpResponsePayload,
                },
              },
            },
          ],
        },
      ],
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [followUpToolDeclaration] }],
      },
    })
  );

  return {
    reply: response2.text || 'Consulta completada.',
    toolTrace: {
      toolName: firstCall.name || MCP_TOOL_NAME,
      arguments: toolArgs,
      mcpRequestPayload: mcpCall.mcpRequestPayload,
      mcpResponsePayload: mcpCall.mcpResponsePayload,
      queryResult: mcpCall.queryResult,
      durationMs,
    },
  };
}
