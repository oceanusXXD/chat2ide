import {
  ApiErrorResponse,
  AuthStatusResponse,
  CreateTerminalRequest,
  LoginRequestBody,
  TerminalSummary,
  UpdateTerminalRequest,
} from '@shared/protocol';

interface TerminalListResponse {
  items: TerminalSummary[];
}

interface TerminalItemResponse {
  item: TerminalSummary;
}

interface OkResponse {
  ok: true;
}

export function getAuthStatus(): Promise<AuthStatusResponse> {
  return requestJson<AuthStatusResponse>('/api/auth/me');
}

export function loginWithPin(pin: string): Promise<AuthStatusResponse> {
  return requestJson<AuthStatusResponse>('/api/auth/pin', {
    method: 'POST',
    body: {
      pin,
    } satisfies LoginRequestBody,
  });
}

export async function logout(): Promise<void> {
  await requestVoid('/api/auth/logout', {
    method: 'POST',
  });
}

export async function listTerminals(): Promise<TerminalSummary[]> {
  const response = await requestJson<TerminalListResponse>('/api/terminals');
  return response.items;
}

export async function createTerminal(
  body: CreateTerminalRequest = {},
): Promise<TerminalSummary> {
  const response = await requestJson<TerminalItemResponse>('/api/terminals', {
    method: 'POST',
    body,
  });
  return response.item;
}

export async function renameTerminal(
  terminalId: string,
  body: UpdateTerminalRequest,
): Promise<TerminalSummary> {
  const response = await requestJson<TerminalItemResponse>(
    `/api/terminals/${encodeURIComponent(terminalId)}`,
    {
      method: 'PATCH',
      body,
    },
  );
  return response.item;
}

export async function stopTerminal(terminalId: string): Promise<OkResponse> {
  return requestJson<OkResponse>(
    `/api/terminals/${encodeURIComponent(terminalId)}/stop`,
    {
      method: 'POST',
    },
  );
}

export async function restartTerminal(terminalId: string): Promise<OkResponse> {
  return requestJson<OkResponse>(
    `/api/terminals/${encodeURIComponent(terminalId)}/restart`,
    {
      method: 'POST',
    },
  );
}

export function closeTerminal(terminalId: string): Promise<void> {
  return requestVoid(`/api/terminals/${encodeURIComponent(terminalId)}`, {
    method: 'DELETE',
  });
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function requestJson<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers:
      options.body === undefined
        ? undefined
        : {
            'Content-Type': 'application/json',
          },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return (await response.json()) as T;
}

async function requestVoid(
  url: string,
  options: RequestOptions = {},
): Promise<void> {
  const response = await fetch(url, {
    method: options.method ?? 'POST',
    credentials: 'same-origin',
    headers:
      options.body === undefined
        ? undefined
        : {
            'Content-Type': 'application/json',
          },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
}

async function readApiError(response: Response): Promise<string> {
  try {
    const parsed = (await response.json()) as Partial<ApiErrorResponse>;
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error;
    }
  } catch {
    // Fall through to the generic status message below.
  }
  return `Request failed with HTTP ${response.status}`;
}
