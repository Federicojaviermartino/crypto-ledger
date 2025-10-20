module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps', '<rootDir>/packages'],
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  moduleNameMapper: {
    '^@crypto-ledger/db$': '<rootDir>/packages/db/src',
    '^@crypto-ledger/shared/(.*)$': '<rootDir>/packages/shared/src/$1',
    '^@crypto-ledger/crypto/(.*)$': '<rootDir>/packages/crypto/src/$1',
    '^@crypto-ledger/reports/(.*)$': '<rootDir>/packages/reports/src/$1',
    '^@crypto-ledger/analytics/(.*)$': '<rootDir>/packages/analytics/src/$1',
  },
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
