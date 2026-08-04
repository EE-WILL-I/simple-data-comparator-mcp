/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  forceExit: true,
  moduleNameMapper: {
    // Strip .js extensions so NodeNext TypeScript sources resolve under Jest CJS mode
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Allow Jest to transform ESM-only node_modules (jsondiffpatch ships ESM only)
  transformIgnorePatterns: [
    'node_modules/(?!(jsondiffpatch)/)',
  ],
  transform: {
    // TypeScript files → ts-jest in CommonJS mode
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          skipLibCheck: true,
        },
      },
    ],
    // Plain JS files inside jsondiffpatch → babel-jest (convert ESM → CJS)
    '^.+\\.js$': [
      'babel-jest',
      {
        plugins: ['@babel/plugin-transform-modules-commonjs'],
      },
    ],
  },
};
