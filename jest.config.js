module.exports = {
  preset: '@vue/cli-plugin-unit-jest/presets/typescript-and-babel',
  testMatch: ['**/src/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts', 'jest-localstorage-mock'],
  transform: {
    '\\.(gql|graphql)$': 'jest-transform-graphql',
    '\\.vue$': './vue-transform-root-store.js',
  },
}
