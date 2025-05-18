import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  verbose: true,
  testMatch: ['**/tests/**/*.test.ts'], // Ensure tests dir exists
  setupFilesAfterEnv: ['./src/tests/setup.ts'], // Setup file
  forceExit: true, // May be needed if server doesn't close
  clearMocks: true,
};
export default config;
