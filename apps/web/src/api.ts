/** 统一 API 客户端：同源 Cookie + CSRF 双提交 + 统一错误格式。 */

let csrfToken = "";

export function setCsrf(token: string) {
  csrfToken = token;
}

export interface ApiFailure extends Error {
  code?: string;
  status?: number;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const resp = await fetch(`/api/v1${path}`, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const failure: ApiFailure = new Error(err.message || `请求失败（${resp.status}）`);
    failure.code = err.code;
    failure.status = resp.status;
    throw failure;
  }
  return resp.json();
}

export function newClientMessageId(): string {
  return crypto.randomUUID();
}

export async function uploadImage(body: FormData): Promise<unknown> {
  const response = await fetch("/api/v1/attachments", {
    method: "POST", credentials: "include", headers: { "x-csrf-token": csrfToken }, body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "图片上传失败");
  return data;
}
