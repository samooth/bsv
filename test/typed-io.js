'use strict'
import { Bn } from '../lib/bn'
import { Reader } from '../lib/reader'
import { SafeRecord } from '../lib/safe-record'
import { Writer } from '../lib/writer'
import should from 'should'

void should

describe('typed IO and SafeRecord', function () {
  it('should round-trip primitives', function () {
    const writer = new Writer()
      .writeUInt8(1)
      .writeUInt16LE(0x0203)
      .writeUInt32LE(0x04050607)
      .writeUInt64LE(new Bn('08090a0b0c0d0e0f', 16))
      .write(Buffer.from('abcd', 'hex'))
    const bytes = writer.toBuffer()
    const reader = new Reader(bytes)
    reader.readUInt8().should.equal(1)
    reader.readUInt16LE().should.equal(0x0203)
    reader.readUInt32LE().should.equal(0x04050607)
    reader.readUInt64LEBn().toString(16).should.equal('8090a0b0c0d0e0f')
    reader.read(2).toString('hex').should.equal('abcd')
    reader.eof().should.equal(true)
    writer.toUint8Array().length.should.equal(bytes.length)
  })

  it('should reject reads past the end', function () {
    ;(function () {
      new Reader(Buffer.alloc(1)).readUInt32LE()
    }.should.throw(RangeError))
  })

  it('should decode canonical varints', function () {
    new Reader(Buffer.from('fdffff', 'hex')).readVarIntNum().should.equal(0xffff)
    ;(function () {
      new Reader(Buffer.from('fd0100', 'hex')).readVarIntNum()
    }.should.throw('non-canonical varInt'))
  })

  it('should reject prototype-polluting keys', function () {
    for (const key of ['__proto__', 'prototype', 'constructor']) {
      ;(function () {
        new SafeRecord().set(key, 1)
      }.should.throw(TypeError))
    }
    const record = new SafeRecord({ a: 1 }).set('b', 2)
    record.get('a').should.equal(1)
    record.size.should.equal(2)
    SafeRecord.fromJSON(record.toJSON()).get('b').should.equal(2)
  })
})
