process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.JWT_SECRET ??= 'test-only-jwt-secret-that-is-at-least-32-characters';
process.env.COOKIE_SECURE ??= 'false';
process.env.LOG_LEVEL ??= 'silent';
process.env.LLM_PROVIDER ??= 'heuristic';
process.env.NODE_ENV = 'test';
