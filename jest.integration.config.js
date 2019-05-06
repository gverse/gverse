module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "./src/test/integration",
  verbose: true,
  globals: {
    "ts-jest": {
      diagnostics: false
    }
  }
}
