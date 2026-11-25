/**
 * Typed byte reader
 * =================
 *
 * Bounds-checked reader over a Uint8Array/Buffer, with big-endian varints
 * decoded canonically (BRC-12).
 */
'use strict'

import { Bn } from './bn'

class Reader {
  constructor (bytes = Buffer.alloc(0)) {
    this.buf = Buffer.from(bytes)
    this.pos = 0
  }

  get length () {
    return this.buf.length
  }

  eof () {
    return this.pos >= this.buf.length
  }

  read (len) {
    if (len < 0 || this.pos + len > this.buf.length) {
      throw new RangeError('read beyond end of buffer')
    }
    const out = this.buf.slice(this.pos, this.pos + len)
    this.pos += len
    return out
  }

  readUInt8 () {
    return this.read(1).readUInt8(0)
  }

  readUInt16LE () {
    return this.read(2).readUInt16LE(0)
  }

  readUInt32LE () {
    return this.read(4).readUInt32LE(0)
  }

  readUInt64LEBn () {
    return new Bn().fromBuffer(this.read(8), { endian: 'little' })
  }

  readVarIntBuf () {
    const start = this.pos
    this.readVarIntNum()
    return this.buf.slice(start, this.pos)
  }

  readVarIntNum () {
    const first = this.readUInt8()
    if (first < 0xfd) return first
    if (first === 0xfd) {
      const value = this.readUInt16LE()
      if (value < 0xfd) throw new Error('non-canonical varInt')
      return value
    }
    if (first === 0xfe) {
      const value = this.readUInt32LE()
      if (value <= 0xffff) throw new Error('non-canonical varInt')
      return value
    }
    const bn = this.readUInt64LEBn()
    if (bn.lte(new Bn(0xffffffff))) throw new Error('non-canonical varInt')
    if (bn.abs().toString(16) === 'ffffffffffffffff') return -1
    if (bn.gt(new Bn(Number.MAX_SAFE_INTEGER))) {
      throw new Error('number too large to retain precision')
    }
    return bn.toNumber()
  }
}

export { Reader }
