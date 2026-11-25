import _Bn from 'bn.js'

function Bn (n, base, endian) {
  if (!(this instanceof Bn)) {
    return new Bn(n, base, endian)
  }
  if (n && (n instanceof _Bn || n.constructor.name === 'BN' || n.constructor.name === 'Bn')) {
    _Bn.call(this, 0)
    n.copy(this)
    this.negative = n.negative
    this.length = n.length
    this.red = n.red
    return
  }
  _Bn.call(this, n, base, endian)
}

Bn.prototype = Object.create(_Bn.prototype)
Bn.prototype.constructor = Bn

// Copy static methods from _Bn
Object.keys(_Bn).forEach(function (key) {
  if (!Bn[key]) {
    Bn[key] = _Bn[key]
  }
})

function reverseBuf (buf) {
  const buf2 = Buffer.alloc(buf.length)
  for (let i = 0; i < buf.length; i++) {
    buf2[i] = buf[buf.length - 1 - i]
  }
  return buf2
}

Bn.prototype.fromHex = function (hex, opts) {
  return this.fromBuffer(Buffer.from(hex, 'hex'), opts)
}

Bn.prototype.toHex = function (opts) {
  return this.toBuffer(opts).toString('hex')
}

Bn.prototype.toJSON = function () {
  return this.toString()
}

Bn.prototype.fromJSON = function (str) {
  const bn = new Bn(str)
  bn.copy(this)
  return this
}

Bn.prototype.fromNumber = function (n) {
  const bn = new Bn(n)
  bn.copy(this)
  return this
}

Bn.prototype.toNumber = function () {
  return parseInt(this.toString(10), 10)
}

Bn.prototype.fromString = function (str, base) {
  const bn = new Bn(str, base)
  bn.copy(this)
  return this
}

Bn.fromBuffer = function (buf, opts = { endian: 'big' }) {
  if (opts.endian === 'little') {
    buf = reverseBuf(buf)
  }
  const hex = buf.toString('hex')
  const bn = new Bn(hex, 16)
  return bn
}

Bn.prototype.fromBuffer = function (buf, opts) {
  const bn = Bn.fromBuffer(buf, opts)
  bn.copy(this)
  return this
}

Bn.prototype.toBuffer = function (opts = { size: undefined, endian: 'big' }) {
  let buf
  if (opts.size) {
    const hex = this.toString(16, 2)
    const natlen = hex.length / 2
    buf = Buffer.from(hex, 'hex')

    if (natlen === opts.size) {
      // pass
    } else if (natlen > opts.size) {
      buf = buf.slice(natlen - buf.length, buf.length)
    } else if (natlen < opts.size) {
      const rbuf = Buffer.alloc(opts.size)
      for (let i = 0; i < buf.length; i++) {
        rbuf[rbuf.length - 1 - i] = buf[buf.length - 1 - i]
      }
      for (let i = 0; i < opts.size - natlen; i++) {
        rbuf[i] = 0
      }
      buf = rbuf
    }
  } else {
    const hex = this.toString(16, 2)
    buf = Buffer.from(hex, 'hex')
  }

  if (opts.endian === 'little') {
    buf = reverseBuf(buf)
  }
  const longzero = Buffer.from([0])
  if (Buffer.compare(buf, longzero) === 0) {
    return Buffer.from([])
  }
  return buf
}

Bn.prototype.toFastBuffer = function (opts) {
  return this.toBuffer(opts)
}
Bn.fromFastBuffer = Bn.fromBuffer
Bn.prototype.fromFastBuffer = Bn.prototype.fromBuffer

Bn.prototype.fromSm = function (buf, opts = { endian: 'big' }) {
  if (buf.length === 0) {
    this.fromBuffer(Buffer.from([0]))
    this.negative = 0
    return this
  }

  let buf2 = Buffer.from(buf)
  const endian = opts.endian
  if (endian === 'little') {
    buf2 = reverseBuf(buf2)
  }

  if (buf2[0] & 0x80) {
    buf2[0] = buf2[0] & 0x7f
    this.fromBuffer(buf2)
    this.ineg()
  } else {
    this.fromBuffer(buf2)
    this.negative = 0
  }
  return this
}

Bn.prototype.toSm = function (opts = { endian: 'big' }) {
  const endian = opts.endian

  let buf
  if (this.negative) {
    const neg = this.abs()
    buf = neg.toBuffer()
    if (buf.length > 0 && (buf[0] & 0x80)) {
      buf = Buffer.concat([Buffer.from([0x80]), buf])
    } else if (buf.length > 0) {
      buf[0] = buf[0] | 0x80
    } else {
      buf = Buffer.from([0x80])
    }
  } else {
    buf = this.toBuffer()
    if (buf.length > 0 && (buf[0] & 0x80)) {
      buf = Buffer.concat([Buffer.from([0x00]), buf])
    }
  }

  if (buf.length === 1 && buf[0] === 0) {
    buf = Buffer.from([])
  }

  if (endian === 'little') {
    buf = reverseBuf(buf)
  }

  return buf
}

Bn.prototype.fromBits = function (bits, opts = { strict: false }) {
  let buf = Buffer.alloc(4)
  buf.writeUInt32BE(bits, 0)
  bits = buf.readInt32BE(0)
  if (opts.strict && bits & 0x00800000) {
    throw new Error('negative bit set')
  }
  const nsize = bits >> 24
  const nword = bits & 0x007fffff
  buf = Buffer.alloc(4)
  buf.writeInt32BE(nword)
  if (nsize <= 3) {
    buf = buf.slice(1, nsize + 1)
  } else {
    const fill = Buffer.alloc(nsize - 3)
    fill.fill(0)
    buf = Buffer.concat([buf, fill])
  }
  this.fromBuffer(buf)
  if (bits & 0x00800000) {
    this.ineg()
  }
  return this
}

Bn.prototype.toBits = function () {
  const neg = this.negative
  const abs = this.abs()
  const buf = abs.toBuffer()
  let nsize = buf.length
  let nword
  if (nsize > 3) {
    nword = Buffer.concat([Buffer.from([0]), buf.slice(0, 3)]).readUInt32BE(0)
  } else if (nsize <= 3) {
    // Compact words are left-aligned to the first three bytes.
    nword = 0
    for (let i = 0; i < nsize; i++) {
      nword |= buf[i] << (8 * (2 - i))
    }
  }
  if (nword & 0x00800000) {
    nword >>= 8
    nsize++
  }
  if (neg) {
    nword |= 0x00800000
  }
  const bits = (nsize << 24) | nword
  const buf2 = Buffer.alloc(4)
  buf2.writeInt32BE(bits, 0)
  return buf2.readUInt32BE(0)
}

Bn.prototype.fromScriptNumBuffer = function (buf, fRequireMinimal, nMaxNumSize) {
  if (nMaxNumSize === undefined) {
    nMaxNumSize = 4
  }
  if (buf.length > nMaxNumSize) {
    throw new Error(`script number overflow nMaxNumSize: ${nMaxNumSize}`)
  }

  if (fRequireMinimal && buf.length > 0) {
    if ((buf[buf.length - 1] & 0x7f) === 0) {
      if (buf.length <= 1 || (buf[buf.length - 2] & 0x80) === 0) {
        throw new Error('non-minimally encoded script number')
      }
    }
  }
  return this.fromSm(buf, { endian: 'little' })
}

Bn.prototype.toScriptNumBuffer = function () {
  return this.toSm({ endian: 'little' })
}

const wrap = function (res) {
  if (res && (res instanceof _Bn || res.constructor.name === 'BN' || res.constructor.name === 'Bn') && !(res instanceof Bn)) {
    return new Bn(res)
  }
  return res
}

// These methods expect another BN as argument
const bnArgMethods = [
  'add', 'sub', 'mul', 'div', 'mod', 'umod', 'invm', 'and', 'or', 'xor',
  'redAdd', 'redSub', 'redMul', 'redPow', 'gcd', 'egcd', 'lcm'
]

bnArgMethods.forEach(method => {
  const original = _Bn.prototype[method]
  Bn.prototype[method] = function (arg, ...rest) {
    if (typeof arg === 'string' || typeof arg === 'number') {
      arg = new Bn(arg)
    }
    return wrap(original.call(this, arg, ...rest))
  }
})

// These methods expect a number (bits) as argument
const numArgMethods = ['ushln', 'ushrn', 'shln', 'shrn', 'testn', 'maskn', 'setn', 'clrn', 'bincn']
numArgMethods.forEach(method => {
  const original = _Bn.prototype[method]
  Bn.prototype[method] = function (arg, ...rest) {
    if (arg && (arg instanceof _Bn || arg.constructor.name === 'BN' || arg.constructor.name === 'Bn')) {
      arg = arg.toNumber()
    }
    return wrap(original.call(this, arg, ...rest))
  }
})

// These methods expect no arguments
const noArgMethods = ['sqr', 'neg', 'abs', 'not', 'redSqr', 'redSqrt', 'redNeg']
noArgMethods.forEach(method => {
  const original = _Bn.prototype[method]
  Bn.prototype[method] = function () {
    return wrap(original.call(this))
  }
})

// special case for reduction context
Bn.prototype.toRed = function (red) {
  return wrap(_Bn.prototype.toRed.call(this, red))
}
Bn.prototype.fromRed = function () {
  return wrap(_Bn.prototype.fromRed.call(this))
}

const cmps = ['cmp', 'gt', 'geq', 'lt', 'leq', 'eq', 'neq']
cmps.forEach(method => {
  const original = _Bn.prototype.cmp
  Bn.prototype[method] = function (arg) {
    if (typeof arg === 'string' || typeof arg === 'number') {
      arg = new Bn(arg)
    }
    const res = original.call(this, arg)
    if (method === 'eq') return res === 0
    if (method === 'neq') return res !== 0
    if (method === 'gt') return res > 0
    if (method === 'geq') return res >= 0
    if (method === 'lt') return res < 0
    if (method === 'leq') return res <= 0
    return res
  }
})

export { Bn }
