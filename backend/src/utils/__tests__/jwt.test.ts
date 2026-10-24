import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../jwt";
import { JwtPayload } from "../../types";

const samplePayload: JwtPayload = {
  userId: 1,
  email: "dosen@example.com",
  roles: ["dosen"],
};

describe("jwt utils", () => {
  it("sign & verify access token mengembalikan payload yang sama", () => {
    const token = signAccessToken(samplePayload);
    const decoded = verifyAccessToken(token);

    expect(decoded.userId).toBe(samplePayload.userId);
    expect(decoded.email).toBe(samplePayload.email);
    expect(decoded.roles).toEqual(samplePayload.roles);
  });

  it("sign & verify refresh token mengembalikan payload yang sama", () => {
    const token = signRefreshToken(samplePayload);
    const decoded = verifyRefreshToken(token);

    expect(decoded.userId).toBe(samplePayload.userId);
  });

  it("access token ditolak kalau diverifikasi sebagai refresh token", () => {
    // access & refresh pakai secret berbeda (JWT_ACCESS_SECRET vs
    // JWT_REFRESH_SECRET), jadi ini harus gagal signature check-nya.
    const accessToken = signAccessToken(samplePayload);

    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });

  it("token yang di-tamper ditolak", () => {
    const token = signAccessToken(samplePayload);
    const tampered = `${token.slice(0, -2)}xx`;

    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});
