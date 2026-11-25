/**
 * Pay to Push Drop (BRC-48)
 * =========================
 *
 * <data> ... OP_DROP OP_2DROP <public key> OP_CHECKSIG
 */
'use strict'

import { OpCode } from './op-code'
import { Script } from './script'
import { Sig } from './sig'

class PushDrop {
  /** Lock data fields to a public key. */
  lock (fields, pubKey) {
    const data = fields.map(field =>
      Buffer.isBuffer(field) ? field : Buffer.from(field)
    )
    const script = new Script()
    for (const field of data) {
      script.writeBuffer(field)
    }
    // The reference template drops three fields: the last one with OP_DROP
    // and the remaining two with OP_2DROP.
    if (data.length === 3) {
      script.writeOpCode(OpCode.OP_DROP).writeOpCode(OpCode.OP_2DROP)
    } else {
      for (let i = 0; i < data.length; i++) {
        script.writeOpCode(OpCode.OP_DROP)
      }
    }
    const pubKeyBuf = Buffer.isBuffer(pubKey) ? pubKey : pubKey.toDer(true)
    return script.writeBuffer(pubKeyBuf).writeOpCode(OpCode.OP_CHECKSIG)
  }

  /** Spend a push-drop output with the owner's signature. */
  unlock (sig) {
    const sigBuf = sig instanceof Sig ? sig.toTxFormat() : sig
    return new Script().writeBuffer(sigBuf)
  }
}

export { PushDrop }
