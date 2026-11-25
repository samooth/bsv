/**
 * AES-GCM (BRC-2)
 * ===============
 *
 * Pure-JavaScript AES in Galois/Counter Mode, using the existing AES block
 * cipher. BRC-2 frames encrypted data as IV (32 bytes) || ciphertext || tag
 * (16 bytes), with the ECDH X coordinate used directly as the 256-bit key.
 */
'use strict'

import { Aes } from './aes'

const xorBlocks = function (a, b) {
  const out = Buffer.alloc(16)
  for (let i = 0; i < 16; i++) {
    out[i] = a[i] ^ b[i]
  }
  return out
}

// Multiplication in GF(2^128) with the GCM bit-reflected representation.
const gfMul = function (xBuf, yBuf) {
  const x = Aes.buf2Words(xBuf)
  const v = Aes.buf2Words(yBuf)
  const z = [0, 0, 0, 0]
  for (let i = 0; i < 128; i++) {
    if ((x[Math.floor(i / 32)] & (0x80000000 >>> (i % 32))) !== 0) {
      for (let k = 0; k < 4; k++) {
        z[k] ^= v[k]
      }
    }
    const lsb = v[3] & 1
    v[3] = (v[3] >>> 1) | ((v[2] & 1) << 31)
    v[2] = (v[2] >>> 1) | ((v[1] & 1) << 31)
    v[1] = (v[1] >>> 1) | ((v[0] & 1) << 31)
    v[0] = v[0] >>> 1
    if (lsb) {
      v[0] ^= 0xe1000000
    }
  }
  return Aes.words2Buf(z.map(function (word) {
    return word >>> 0
  }))
}

const pad16 = function (buf) {
  const pad = (16 - (buf.length % 16)) % 16
  return pad ? Buffer.concat([buf, Buffer.alloc(pad)]) : Buffer.from(buf)
}

const ghash = function (h, data) {
  let y = Buffer.alloc(16)
  const padded = pad16(data)
  for (let i = 0; i < padded.length; i += 16) {
    y = gfMul(xorBlocks(y, padded.slice(i, i + 16)), h)
  }
  return y
}

const writeUInt64BE = function (buf, value, offset) {
  buf.writeUInt32BE(Math.floor(value / 0x100000000), offset)
  buf.writeUInt32BE(value >>> 0, offset + 4)
}

const lenBlock = function (bitLength) {
  const buf = Buffer.alloc(16)
  writeUInt64BE(buf, bitLength, 8)
  return buf
}

const tagLengthBlock = function (aadBits, dataBits) {
  const buf = Buffer.alloc(16)
  writeUInt64BE(buf, aadBits, 0)
  writeUInt64BE(buf, dataBits, 8)
  return buf
}

const inc32 = function (buf) {
  const out = Buffer.from(buf)
  let carry = 1
  for (let i = 15; i >= 12 && carry; i--) {
    const value = out[i] + carry
    out[i] = value & 0xff
    carry = value >> 8
  }
  return out
}

const gctr = function (key, initial, data) {
  const out = Buffer.alloc(data.length)
  let counter = Buffer.from(initial)
  for (let i = 0; i < data.length; i += 16) {
    const stream = Aes.encrypt(counter, key)
    const len = Math.min(16, data.length - i)
    for (let j = 0; j < len; j++) {
      out[i + j] = data[i + j] ^ stream[j]
    }
    counter = inc32(counter)
  }
  return out
}

const initialCounter = function (key, iv) {
  if (iv.length === 12) {
    return Buffer.concat([iv, Buffer.from([0, 0, 0, 1])])
  }
  const h = Aes.encrypt(Buffer.alloc(16), key)
  const data = Buffer.concat([
    pad16(iv),
    Buffer.alloc(8),
    lenBlock(iv.length * 8).slice(8)
  ])
  return ghash(h, data)
}

class AesGcm {
  /** Return { ciphertext, tag } for AES-256-GCM. */
  static encrypt (key, iv, plaintext, aad = Buffer.alloc(0)) {
    const h = Aes.encrypt(Buffer.alloc(16), key)
    const j0 = initialCounter(key, iv)
    const ciphertext = gctr(key, inc32(j0), plaintext)
    const s = ghash(
      h,
      Buffer.concat([
        pad16(aad),
        pad16(ciphertext),
        tagLengthBlock(aad.length * 8, ciphertext.length * 8)
      ])
    )
    return { ciphertext, tag: gctr(key, j0, s).slice(0, 16) }
  }

  /** Decrypt and verify the tag; throws on authentication failure. */
  static decrypt (key, iv, ciphertext, tag, aad = Buffer.alloc(0)) {
    const h = Aes.encrypt(Buffer.alloc(16), key)
    const j0 = initialCounter(key, iv)
    const s = ghash(
      h,
      Buffer.concat([
        pad16(aad),
        pad16(ciphertext),
        tagLengthBlock(aad.length * 8, ciphertext.length * 8)
      ])
    )
    const expected = gctr(key, j0, s).slice(0, 16)
    if (!Buffer.from(tag).equals(Buffer.from(expected))) {
      throw new Error('AES-GCM authentication failed')
    }
    return gctr(key, inc32(j0), ciphertext)
  }

  /** BRC-2 framing: IV || ciphertext || tag, with a 32-byte IV. */
  static encryptBrc2 (key, plaintext) {
    const iv = Buffer.alloc(32)
    for (let i = 0; i < iv.length; i += 4) {
      iv.writeUInt32LE((Math.random() * 0x100000000) >>> 0, i)
    }
    const result = AesGcm.encrypt(key, iv, plaintext)
    return Buffer.concat([iv, result.ciphertext, result.tag])
  }

  static decryptBrc2 (key, framed) {
    if (framed.length < 48) {
      throw new Error('AES-GCM ciphertext is too short')
    }
    const iv = framed.slice(0, 32)
    const tag = framed.slice(framed.length - 16)
    const ciphertext = framed.slice(32, framed.length - 16)
    return AesGcm.decrypt(key, iv, ciphertext, tag)
  }
}

export { AesGcm }
