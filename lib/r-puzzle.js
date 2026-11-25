/**
 * Pay to R Puzzle Hash (BRC-17)
 * =============================
 *
 * The locking script extracts the R component from an ECDSA signature and
 * compares its HASH160 with a committed hash before checking the signature.
 */
'use strict'

import { Hash } from './hash'
import { OpCode } from './op-code'
import { Script } from './script'
import { Sig } from './sig'

class RPuzzle {
  /** Commit to the HASH160 of a signature's R component. */
  lock (rHash) {
    if (!Buffer.isBuffer(rHash) || rHash.length !== 20) {
      throw new Error('rHash must be a 20-byte buffer')
    }
    return new Script()
      .writeOpCode(OpCode.OP_OVER)
      .writeOpCode(OpCode.OP_3)
      .writeOpCode(OpCode.OP_SPLIT)
      .writeOpCode(OpCode.OP_NIP)
      .writeOpCode(OpCode.OP_TRUE)
      .writeOpCode(OpCode.OP_SPLIT)
      .writeOpCode(OpCode.OP_SWAP)
      .writeOpCode(OpCode.OP_SPLIT)
      .writeOpCode(OpCode.OP_DROP)
      .writeOpCode(OpCode.OP_HASH160)
      .writeBuffer(rHash)
      .writeOpCode(OpCode.OP_EQUALVERIFY)
      .writeOpCode(OpCode.OP_CHECKSIG)
  }

  /** Provide the signature and the public key used for its S component. */
  unlock (sig, pubKey) {
    const sigBuf = sig instanceof Sig ? sig.toTxFormat() : sig
    const pubKeyBuf = Buffer.isBuffer(pubKey) ? pubKey : pubKey.toDer(true)
    return new Script().writeBuffer(sigBuf).writeBuffer(pubKeyBuf)
  }

  /** Hash of the R value of a DER signature. */
  static hashR (sig) {
    const sigBuf = sig instanceof Sig ? sig.toTxFormat() : sig
    const rLen = sigBuf[3]
    return Hash.sha256Ripemd160(sigBuf.slice(4, 4 + rLen))
  }
}

export { RPuzzle }
