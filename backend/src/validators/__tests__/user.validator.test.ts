import {
  loginSchema,
  registerDosenSchema,
  paginationSchema,
} from "../user.validator";

describe("loginSchema", () => {
  it("valid untuk email & password yang benar", () => {
    const result = loginSchema.safeParse({
      email: "dosen@example.com",
      password: "rahasia123",
    });

    expect(result.success).toBe(true);
  });

  it("invalid kalau formatnya bukan email", () => {
    const result = loginSchema.safeParse({
      email: "bukan-email",
      password: "rahasia123",
    });

    expect(result.success).toBe(false);
  });

  it("invalid kalau password kurang dari 6 karakter", () => {
    const result = loginSchema.safeParse({
      email: "dosen@example.com",
      password: "123",
    });

    expect(result.success).toBe(false);
  });
});

describe("registerDosenSchema", () => {
  it("invalid kalau password kurang dari 8 karakter (lebih ketat dari login)", () => {
    const result = registerDosenSchema.safeParse({
      email: "dosen@example.com",
      name: "Budi Santoso",
      password: "short1",
    });

    expect(result.success).toBe(false);
  });

  it("valid hanya dengan field wajib (email, name, password)", () => {
    const result = registerDosenSchema.safeParse({
      email: "dosen@example.com",
      name: "Budi Santoso",
      password: "password123",
    });

    expect(result.success).toBe(true);
  });
});

describe("paginationSchema", () => {
  it("pakai default page=1 dan limit=10 kalau tidak dikirim", () => {
    const result = paginationSchema.parse({});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it("coerce query string jadi number", () => {
    // req.query selalu berupa string, jadi ini penting: "3" -> 3
    const result = paginationSchema.parse({ page: "3", limit: "20" });

    expect(result.page).toBe(3);
    expect(result.limit).toBe(20);
  });

  it("invalid kalau limit di atas 100", () => {
    const result = paginationSchema.safeParse({ limit: 500 });

    expect(result.success).toBe(false);
  });
});
