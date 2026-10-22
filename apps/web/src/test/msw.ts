import { setupServer } from 'msw/node';

/** MSW server for component tests. Add per-test handlers with server.use(...). */
export const server = setupServer();
