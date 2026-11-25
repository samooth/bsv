/**
 * Typed byte writer
 * =================
 *
 * Accumulates bytes into a Buffer with explicit little-endian writes.
 */
'use strict'

import { Bn } from './bn'

class Writer {
  constructor () {
    this.chunks = []
  }

  write (bytes) {
    this.chunks.push(Buffer.from(bytes))
    return this
  }

  writeUInt8 (value) {
    const buf = Buffer.alloc(1)
    buf.writeUInt8(value, 0)
    return this.write(buf)
  }

  writeUInt16LE (value) {
    const buf = Buffer.alloc(2)
    buf.writeUInt16LE(value, 0)
    return this.write(buf)
  }

  writeUInt32LE (value) {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(value >>> 0, 0)
    return this.write(buf)
  }

  writeUInt64LE (value) {
    const bn = value instanceof Bn ? value : new Bn(value)
    return this.write(bn.toBuffer({ size: 8, endian: 'little' }))
  }

  toBuffer () {
    return Buffer.concat(this.chunks)
  }

  toUint8Array () {
    return new Uint8Array(this.toBuffer())
  }
}

export { Writer }
