import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  bytesToHex,
  sha256Hex,
  SHA256_HEX_PATTERN,
  type DigestFn,
} from "./hash";

const nodeDigest: DigestFn = (bytes) =>
  webcrypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);

describe("sha256Hex", () => {
  it("returns lowercase 64-character hex for known vectors", async () => {
    const abc = new TextEncoder().encode("abc");
    await expect(sha256Hex(abc, nodeDigest)).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const empty = await sha256Hex(new Uint8Array(), nodeDigest);
    expect(empty).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(empty).toMatch(SHA256_HEX_PATTERN);
  });

  it("uses the injected digest", async () => {
    const digest: DigestFn = async () =>
      new Uint8Array([0, 1, 0xab, 0xff]).buffer;
    await expect(sha256Hex(new Uint8Array([1]), digest)).resolves.toBe(
      "0001abff",
    );
  });

  it("rejects when no digest is available", async () => {
    await expect(sha256Hex(new Uint8Array([1]), null)).rejects.toThrow(
      "SHA-256 digest is unavailable",
    );
  });
});

describe("bytesToHex", () => {
  it("zero-pads each byte", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe("000f10ff");
  });
});
