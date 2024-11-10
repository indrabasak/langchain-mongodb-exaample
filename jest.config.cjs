/** @type {import('ts-jest').JestConfigWithTsJest} */

const ignoredModules = ['flat'].join('|');

module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)?$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [`<rootDir>/node_modules/(?!(${ignoredModules})/)`],
  testEnvironment: 'node',
  collectCoverage: true,
  clearMocks: true,
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  coverageDirectory: 'coverage',
  testResultsProcessor: 'jest-sonar-reporter',
  reporters: [
    'default',
    [
      './node_modules/jest-html-reporter',
      {
        pageTitle: 'Simple AWS Chatbot Test Report',
        outputPath: 'test-reports/jest-sonar-report.html',
        includeFailureMsg: true,
      },
    ],
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coveragePathIgnorePatterns: ['.*/types.ts', '.*/constant.ts'],
  moduleNameMapper: {
    '^configFilePath$': '<rootDir>/test/custom-authorizer/config/config.test.json',
  },
};
