/* global describe,it */
'use strict'
import should from 'should'
import { Bn } from '../lib/bn'
import { Interp } from '../lib/interp'
import { Script } from '../lib/script'
import { Tx } from '../lib/tx'
import { TxIn } from '../lib/tx-in'
import { TxOut } from '../lib/tx-out'

// Deterministic PRNG so failures are reproducible.
const lcg = (seed) => {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state
  }
}

describe('property checks', function () {
  const next = lcg(0x62737632)

  const randomBytes = function (length) {
    const buf = Buffer.alloc(length)
    for (let i = 0; i < length; i++) {
      buf[i] = next() & 0xff
    }
    return buf
  }

  const randomScript = function () {
    const parts = []
    const count = 1 + (next() % 8)
    for (let i = 0; i < count; i++) {
      const kind = next() % 4
      if (kind === 0) {
        // Small push with an explicit length byte.
        const len = 1 + (next() % 60)
        parts.push(Buffer.from([len]), randomBytes(len))
      } else if (kind === 1) {
        // PUSHDATA1 with a proper length.
        const len = 76 + (next() % 80)
        parts.push(Buffer.from([0x4c, len]), randomBytes(len))
      } else if (kind === 2) {
        parts.push(Buffer.from([0x51 + (next() % 16)])) // OP_1..OP_16
      } else {
        parts.push(Buffer.from([0x61])) // OP_NOP
      }
    }
    return Buffer.concat(parts)
  }

  it('should round-trip well-formed scripts', function () {
    for (let i = 0; i < 100; i++) {
      const raw = randomScript()
      new Script().fromBuffer(raw).toBuffer().should.deepEqual(raw)
    }
  })

  it('should round-trip big numbers from buffers', function () {
    for (let i = 0; i < 100; i++) {
      const raw = randomBytes(1 + (next() % 32))
      raw[0] |= 1 // avoid leading zeros being stripped
      Bn.fromBuffer(raw).toBuffer().should.deepEqual(raw)
    }
  })

  it('should round-trip transactions built from random scripts', function () {
    for (let i = 0; i < 25; i++) {
      const tx = new Tx()
      tx.versionBytesNum = 1 + (next() % 3)
      const nIns = 1 + (next() % 4)
      for (let j = 0; j < nIns; j++) {
        tx.addTxIn(
          randomBytes(32),
          next() % 4,
          new Script().fromBuffer(randomScript()),
          next() % 0xffffffff
        )
      }
      const nOuts = 1 + (next() % 4)
      for (let j = 0; j < nOuts; j++) {
        tx.addTxOut(
          new Bn(next() % 100000),
          new Script().fromBuffer(randomScript())
        )
      }
      const raw = tx.toBuffer()
      new Tx().fromBuffer(raw).toBuffer().should.deepEqual(raw)
    }
  })

  it('should apply the policy script number limit', function () {
    const big = Buffer.alloc(100000)
    big[0] = 1
    const chronicleLimit = new Interp()
      .fromObject({ flags: Interp.SCRIPT_VERIFY_CHRONICLE })
      .scriptNumMaxSize()
    const preGenesisLimit = new Interp()
      .fromObject({ flags: Interp.SCRIPT_VERIFY_PREGENESIS_LIMITS })
      .scriptNumMaxSize()

    BigInt(new Bn().fromScriptNumBuffer(big, false, chronicleLimit).toString())
      .should.equal(1n)
    ;(function () {
      new Bn().fromScriptNumBuffer(big, false, preGenesisLimit)
    }.should.throw('script number overflow nMaxNumSize: 4'))
  })

})
