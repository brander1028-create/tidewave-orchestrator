import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// 🔧 핫픽스 v7.9: 권한 헤더 자동 주입을 위한 apiRequest 수정
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  abortController?: AbortController,
): Promise<Response> {
  const headers = new Headers();
  if (data) {
    headers.set("Content-Type", "application/json");
  }
  // v7.18: 표준화된 owner 헤더 통일 (x-owner=system)
  headers.set('x-owner', 'system');
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    signal: abortController?.signal,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // v7.18: 기본 쿼리 함수에도 표준화된 헤더 적용
    const headers = new Headers();
    headers.set('x-owner', 'system');
    
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
