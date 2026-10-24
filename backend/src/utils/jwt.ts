import jwt, { SignOptions } from "jsonwebtoken";
import { JwtPayload } from "../types";

type TokenKind = "access" | "refresh";

interface JwtTokenConfig {
  secret: string;
  expiresIn: string;
}

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const jwtConfig: Record<TokenKind, JwtTokenConfig> = {
  access: {
    secret: getRequiredEnv("JWT_ACCESS_SECRET"),
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  },
  refresh: {
    secret: getRequiredEnv("JWT_REFRESH_SECRET"),
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  },
};

const signToken = (payload: JwtPayload, tokenKind: TokenKind): string => {
  const config = jwtConfig[tokenKind];

  const options: SignOptions = {
    expiresIn: config.expiresIn as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, config.secret, options);
};

const verifyToken = (token: string, tokenKind: TokenKind): JwtPayload => {
  const config = jwtConfig[tokenKind];
  return jwt.verify(token, config.secret) as JwtPayload;
};

export const signAccessToken = (payload: JwtPayload): string => {
  return signToken(payload, "access");
};

export const signRefreshToken = (payload: JwtPayload): string => {
  return signToken(payload, "refresh");
};

export const verifyAccessToken = (token: string): JwtPayload => {
  return verifyToken(token, "access");
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  return verifyToken(token, "refresh");
};
