module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  verbose: true
};
