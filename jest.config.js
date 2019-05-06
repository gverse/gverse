module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "./src/test/unit",
  verbose: true,
  globals: {
    "ts-jest": {
      diagnostics: false
    }
  }
}
