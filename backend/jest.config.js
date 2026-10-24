/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",

  // Load env var dummy (JWT secret, DATABASE_URL, dst) sebelum test file
  // di-import, karena beberapa module (mis. src/utils/jwt.ts) baca env
  // var wajib itu langsung saat di-import, bukan saat dipanggil.
  setupFiles: ["<rootDir>/jest.setup.ts"],

  // Reset semua jest.fn() antar test supaya satu test tidak "bocor"
  // mock/call-history ke test lain.
  clearMocks: true,

  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/index.ts",
    "!src/app.ts",
    "!src/config/seed.ts",
    "!src/types/**",
  ],
  coverageDirectory: "coverage",
};