export interface HttpDiagnostics {
  source: 'app-response' | 'google-sheets-upstream';
  status: number;
  statusText: string;
  finalUrl: string;
  redirected: boolean;
  contentType: string;
  bodyPreview?: string;
  grantedScopes?: string;
  tokenEmail?: string;
}

export class DetailedHttpError extends Error {
  status: number;
  diagnostics: HttpDiagnostics;

  constructor(message: string, diagnostics: HttpDiagnostics) {
    super(message);
    this.name = 'DetailedHttpError';
    this.status = diagnostics.status;
    this.diagnostics = diagnostics;
  }
}

export async function fetchJsonWithDiagnostics<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, init);
  const contentType = res.headers.get('content-type') || '(missing)';
  const finalUrl = res.url || String(input);
  const rawText = await res.text();

  let parsed: unknown = null;
  let parseError: Error | null = null;

  if (rawText.length > 0) {
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      parseError = err instanceof Error ? err : new Error('Failed to parse JSON');
    }
  }

  if (parseError || (!contentType.toLowerCase().includes('json') && !res.ok)) {
    const trimmed = rawText.replace(/\s+/g, ' ').trim();
    const preview = trimmed.slice(0, 600);
    const kindHint = res.redirected
      ? 'Request was redirected before reaching JSON API.'
      : contentType.toLowerCase().includes('text/html')
      ? 'Server returned an HTML document instead of JSON.'
      : 'Server returned a non-JSON response.';

    throw new DetailedHttpError(
      `${kindHint} (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''})`,
      {
        source: 'app-response',
        status: res.status,
        statusText: res.statusText,
        finalUrl,
        redirected: res.redirected,
        contentType,
        bodyPreview: preview || '(empty body)',
      }
    );
  }

  if (!res.ok) {
    const errPayload = parsed as {
      error?: string | { message?: string; status?: string; code?: number };
      message?: string;
      diagnostics?: Partial<HttpDiagnostics>;
    } | null;

    const extractedMessage =
      typeof errPayload?.error === 'string'
        ? errPayload.error
        : errPayload?.error?.message || errPayload?.message;

    const upstreamDiag = errPayload?.diagnostics;
    const diagnostics: HttpDiagnostics = upstreamDiag
      ? {
          source: 'google-sheets-upstream',
          status: upstreamDiag.status ?? res.status,
          statusText: upstreamDiag.statusText ?? res.statusText,
          finalUrl: upstreamDiag.finalUrl ?? finalUrl,
          redirected: upstreamDiag.redirected ?? res.redirected,
          contentType: upstreamDiag.contentType ?? contentType,
          bodyPreview: upstreamDiag.bodyPreview,
        }
      : {
          source: finalUrl.includes('googleapis.com')
            ? 'google-sheets-upstream'
            : 'app-response',
          status: res.status,
          statusText: res.statusText,
          finalUrl,
          redirected: res.redirected,
          contentType,
          bodyPreview: rawText.replace(/\s+/g, ' ').trim().slice(0, 600),
        };

    throw new DetailedHttpError(
      extractedMessage || `Request failed with HTTP ${res.status}`,
      diagnostics
    );
  }

  return (parsed ?? {}) as T;
}
