/**
 * VarInt (a.k.a. Compact Size)
 * ============================
 *
 * A varInt is a varible sized integer, and it is a format that is unique to
 * bitcoin, and used throughout bitcoin to represent the length of binary data
 * in a compact format that can take up as little as 1 byte or as much as 9
 * bytes.
 */
'use strict'

import { Br } from './br'
import { Bw } from './bw'
import { Struct } from './struct'

class VarInt extends Struct {
  constructor (buf) {
    super({ buf })
  }

  fromJSON (json) {
    this.fromObject({
      buf: Buffer.from(json, 'hex')
    })
    return this
  }

  toJSON () {
    return this.buf.toString('hex')
  }

  fromBuffer (buf, strict = false) {
    this.buf = buf
    if (strict) {
      this.toNumberStrict()
    }
    return this
  }

  fromBr (br) {
    if (br.strict) {
      this.buf = new Bw().writeVarIntNum(br.readVarIntNumStrict()).toBuffer()
    } else {
      this.buf = br.readVarIntBuf()
    }
    return this
  }

  toNumberStrict () {
    return new Br(this.buf, true).readVarIntNumStrict()
  }

  fromBn (bn) {
    this.buf = new Bw().writeVarIntBn(bn).toBuffer()
    return this
  }

  static fromBn (bn) {
    return new this().fromBn(bn)
  }

  fromNumber (num) {
    this.buf = new Bw().writeVarIntNum(num).toBuffer()
    return this
  }

  static fromNumber (num) {
    return new this().fromNumber(num)
  }

  toBuffer () {
    return this.buf
  }

  toBn () {
    return new Br(this.buf).readVarIntBn()
  }

  toNumber () {
    return new Br(this.buf).readVarIntNum()
  }
}

export { VarInt }
