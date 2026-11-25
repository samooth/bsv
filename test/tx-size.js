'use strict'
import { Bn } from '../lib/bn'
import { FeeModel, SatoshisPerKilobyte } from '../lib/fee-model'
import { transactionSize, varUintSize } from '../lib/tx-size'
import { Script } from '../lib/script'
import { Tx } from '../lib/tx'
import should from 'should'

describe('transaction sizes and fees', function () {
  const makeTx = function () {
    return new Tx()
      .addTxIn(Buffer.alloc(32), 0, new Script().writeString('OP_1'), 0xffffffff)
      .addTxOut(new Bn(1000), new Script().writeString('OP_1 OP_ADD'))
  }

  it('should compute canonical varint sizes', function () {
    varUintSize(0).should.equal(1)
    varUintSize(0xfc).should.equal(1)
    varUintSize(0xfd).should.equal(3)
    varUintSize(0xffff).should.equal(3)
    varUintSize(0x10000).should.equal(5)
    varUintSize(0x100000000).should.equal(9)
    ;(function () {
      varUintSize(-1)
    }.should.throw(RangeError))
  })

  it('should match the real serialized size', function () {
    const tx = makeTx()
    transactionSize(tx).should.equal(tx.toBuffer().length)
  })

  it('should compute fees proportionally to size', function () {
    const tx = makeTx()
    const fee = new SatoshisPerKilobyte(1000).computeFee(tx)
    fee.toNumber().should.equal(Math.ceil(tx.toBuffer().length))
    should.exist(FeeModel)
  })
})
