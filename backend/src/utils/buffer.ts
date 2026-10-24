/**
 * Prisma 7.x menggunakan Uint8Array untuk field Bytes.
 * Helper ini untuk konversi Buffer -> Uint8Array agar kompatibel.
 */
export function toUint8Array(buf: Buffer | null | undefined): Uint8Array | null {
  if (!buf) return null;
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
