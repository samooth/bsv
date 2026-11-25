/**
 * Pay to Public Key Hash (BRC-16)
 * ===============================
 *
 * OP_DUP OP_HASH160 <PubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
 */
'use strict'

import { Address } from './address'
import { OpCode } from './op-code'
import { Script } from './script'
import { Sig } from './sig'

class P2PKH {
  /** Build a locking script from a 20-byte hash or a Base58Check address. */
  lock (pubKeyHashOrAddress) {
    let hash
    if (typeof pubKeyHashOrAddress === 'string') {
      hash = new Address().fromString(pubKeyHashOrAddress).hashBuf
    } else {
      hash = pubKeyHashOrAddress
    }
    if (!Buffer.isBuffer(hash) || hash.length !== 20) {
      throw new Error('pubKeyHash must be a 20-byte buffer or an address')
    }
    return new Script()
      .writeOpCode(OpCode.OP_DUP)
      .writeOpCode(OpCode.OP_HASH160)
      .writeBuffer(hash)
      .writeOpCode(OpCode.OP_EQUALVERIFY)
      .writeOpCode(OpCode.OP_CHECKSIG)
  }

  /** Build an unlocking script from a signature and a public key. */
  unlock (sig, pubKey) {
    const sigBuf = sig instanceof Sig ? sig.toTxFormat() : sig
    const pubKeyBuf = Buffer.isBuffer(pubKey) ? pubKey : pubKey.toDer(true)
    return new Script().writeBuffer(sigBuf).writeBuffer(pubKeyBuf)
  }

  /** Typical unlocking script length, for fee estimation before signing. */
  estimateLength () {
    return 108
  }
}

export { P2PKH }
