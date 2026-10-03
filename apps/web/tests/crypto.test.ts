import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

const key = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("round-trips", () => {
    const ct = encrypt("1//refresh-token", key);
    expect(ct).not.toContain("refresh");
    expect(decrypt(ct, key)).toBe("1//refresh-token");
  });

  it("uses a fresh IV each time", () => {
    expect(encrypt("x", key)).not.toBe(encrypt("x", key));
  });

  it("rejects tampered ciphertext", () => {
    const buf = Buffer.from(encrypt("secret", key), "base64");
    buf[buf.length - 1] ^= 1;
    expect(() => decrypt(buf.toString("base64"), key)).toThrow();
  });

  it("rejects a wrong-size key", () => {
    expect(() => encrypt("x", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
