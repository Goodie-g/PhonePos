import { QueryClient } from '@tanstack/react-query';

/**
 * One QueryClient for the app. Defaults tuned for a business app:
 *  - short staleTime so lists feel live without spamming the API
 *  - one automatic retry (idempotent GETs), and only for network/server errors
 */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: (failureCount, error) => {
          // Never retry deterministic client errors (validation, not found...).
          if (error instanceof Error && 'status' in error && [400, 401, 403, 404, 409, 422].includes((error as any).status)) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
