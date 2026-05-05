type ServerHandler = (input?: unknown) => Promise<unknown>;

function unavailableServerFunction(): ServerHandler {
  return async () => {
    throw new Error(
      "This action requires a server runtime. Hostinger shared hosting can only run the static SPA.",
    );
  };
}

export function createServerFn() {
  const chain = {
    middleware: () => chain,
    inputValidator: () => chain,
    handler: () => unavailableServerFunction(),
  };

  return chain;
}

export function useServerFn<T extends (...args: Array<unknown>) => unknown>(fn: T): T {
  return fn;
}

export function createMiddleware() {
  return {
    server: (handler: unknown) => handler,
  };
}
