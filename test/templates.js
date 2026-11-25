'use strict'
import { Address } from '../lib/address'
import { Bn } from '../lib/bn'
import { Interp } from '../lib/interp'
import { KeyPair } from '../lib/key-pair'
import { P2PKH } from '../lib/p2pkh'
import { PushDrop } from '../lib/push-drop'
import { RPuzzle } from '../lib/r-puzzle'
import { Script } from '../lib/script'
import { Sig } from '../lib/sig'
import { Tx } from '../lib/tx'
import should from 'should'

describe('script templates', function () {
  void should // extends Object.prototype with .should
  const valueBn = new Bn(1000)

  it('should build and spend a P2PKH output', function () {
    const keyPair = new KeyPair().fromRandom()
    const hashBuf = Address.fromPubKey(keyPair.pubKey).hashBuf
    const scriptPubKey = new P2PKH().lock(hashBuf)
    scriptPubKey.toString().should.startWith('OP_DUP OP_HASH160 20 0x')
    new P2PKH().estimateLength().should.equal(108)

    const funding = new Tx()
      .addTxIn(Buffer.alloc(32), 0xffffffff, new Script(), 0xffffffff)
      .addTxOut(valueBn, scriptPubKey)
    const tx = new Tx()
      .addTxIn(funding.hash(), 0, new Script(), 0xffffffff)
      .addTxOut(new Bn(900), new Script())
    const signature = tx.sign(
      keyPair,
      Sig.SIGHASH_ALL | Sig.SIGHASH_FORKID,
      0,
      scriptPubKey,
      valueBn
    )
    const scriptSig = new P2PKH().unlock(signature, keyPair.pubKey)
    tx.txIns[0].setScript(scriptSig)
    new Interp()
      .verify(
        scriptSig,
        scriptPubKey,
        tx,
        0,
        Interp.SCRIPT_ENABLE_SIGHASH_FORKID,
        valueBn
      )
      .should.equal(true)
  })

  it('should build R-puzzle and push-drop locking scripts', function () {
    const keyPair = new KeyPair().fromRandom()
    const rLock = new RPuzzle().lock(Buffer.alloc(20, 1))
    rLock.toString().should.containEql('OP_SPLIT OP_NIP OP_1 OP_SPLIT')

    const pushDrop = new PushDrop().lock(
      [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')],
      keyPair.pubKey
    )
    pushDrop.toString().should.containEql('OP_DROP OP_2DROP')
    pushDrop.toString().should.containEql('OP_CHECKSIG')
  })

  it('should extract the R hash from a signature', function () {
    const keyPair = new KeyPair().fromRandom()
    const tx = new Tx()
      .addTxIn(Buffer.alloc(32), 0, new Script(), 0xffffffff)
      .addTxOut(new Bn(1), new Script())
    const sig = tx.sign(
      keyPair,
      Sig.SIGHASH_ALL | Sig.SIGHASH_FORKID,
      0,
      new Script(),
      new Bn(1)
    )
    RPuzzle.hashR(sig).length.should.equal(20)
  })
})
