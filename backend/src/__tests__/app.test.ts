import request from "supertest";
import app from "../app";

describe("GET /health", () => {
  it("balikin 200 dan status OK", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "OK",
    });
  });
});

describe("route yang tidak terdaftar", () => {
  it("balikin 404 dengan format error standar", async () => {
    const res = await request(app).get("/api/v1/rute-tidak-ada");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe("route yang butuh auth", () => {
  it("balikin 401 kalau request tanpa Bearer token", async () => {
    const res = await request(app).get("/api/v1/users");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Unauthorized");
  });

  it("balikin 401 kalau token invalid", async () => {
    const res = await request(app)
      .get("/api/v1/users")
      .set("Authorization", "Bearer token-ngasal");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Token invalid or expired");
  });
});
