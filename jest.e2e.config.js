module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/api/test'],
  testMatch: ['**/*.e2e-spec.ts'],
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
  setupFilesAfterEnv: ['<rootDir>/apps/api/test/setup.ts'],
  testTimeout: 30000,
};
