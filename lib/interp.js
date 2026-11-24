/**
 * Script Interpreter
 * ==================
 *
 * Bitcoin script interpreter.
 */
'use strict'

import { Bn } from './bn'
import { Br } from './br'
import { Bw } from './bw'
import { Ecdsa } from './ecdsa'
import { Hash } from './hash'
import { OpCode } from './op-code'
import { PubKey } from './pub-key'
import { Script } from './script'
import { Sig } from './sig'
import { Struct } from './struct'
import { Tx } from './tx'
import { TxIn } from './tx-in'
import { TxOut } from './tx-out'
import { VarInt } from './var-int'
import { HashCache } from './hash-cache'
import { cmp } from './cmp'

const preGenesisDisabledOpCodes = [
  OpCode.OP_CAT,
  OpCode.OP_SUBSTR,
  OpCode.OP_LEFT,
  OpCode.OP_RIGHT,
  OpCode.OP_INVERT,
  OpCode.OP_AND,
  OpCode.OP_OR,
  OpCode.OP_XOR,
  OpCode.OP_2MUL,
  OpCode.OP_2DIV,
  OpCode.OP_MUL,
  OpCode.OP_DIV,
  OpCode.OP_MOD,
  OpCode.OP_LSHIFT,
  OpCode.OP_RSHIFT
]

function minimallyEncode (buf) {
  if (buf.length === 0) {
    return buf
  }

  // If the last byte is not 0x00 or 0x80, it is already minimally encoded.
  const last = buf[buf.length - 1]
  if ((last & 0x7f) !== 0) {
    return buf
  }

  // If the script is one byte long, then we have a zero, which encodes as an
  // empty array.
  if (buf.length === 1) {
    return []
  }

  // If the next byte does not have the sign bit set, then the 0x00 or 0x80 byte
  // is redundant.
  if ((buf[buf.length - 2] & 0x80) === 0) {
    return minimallyEncode(buf.slice(0, buf.length - 1))
  }

  return buf
}

class Interp extends Struct {
  constructor (
    script,
    tx,
    nIn,
    stack = [],
    altStack = [],
    pc = 0,
    pBeginCodeHash = 0,
    nOpCount = 0,
    ifStack = [],
    errStr = '',
    flags = Interp.defaultFlags,
    valueBn = new Bn(0)
  ) {
    super({
      script,
      tx,
      nIn,
      stack,
      altStack,
      pc,
      pBeginCodeHash,
      nOpCount,
      ifStack,
      errStr,
      flags,
      valueBn
    })
  }

  initialize () {
    this.script = new Script()
    this.stack = []
    this.altStack = []
    this.pc = 0
    this.pBeginCodeHash = 0
    this.nOpCount = 0
    this.ifStack = []
    this.errStr = ''
    this.flags = Interp.defaultFlags
    this.setLimits()
    return this
  }

  setLimits () {
    this.scriptLimit = this.isPreGenesis() ? Interp.PREGENESIS_SCRIPT_LIMIT : 10000000
    this.stackLimit = this.isPreGenesis() ? Interp.PREGENESIS_STACK_LIMIT : 10000000
    return this
  }

  isPreGenesis () {
    return (this.flags & Interp.SCRIPT_VERIFY_PREGENESIS_LIMITS) !== 0
  }

  isChronicle () {
    return (
      (this.flags & Interp.SCRIPT_VERIFY_CHRONICLE) !== 0 ||
      (this.tx !== undefined && this.tx.versionBytesNum > 1)
    )
  }

  scriptNumMaxSize () {
    if (this.isPreGenesis()) {
      return Interp.PREGENESIS_SCRIPT_NUM_LENGTH
    }
    if (this.isChronicle()) {
      return Interp.DEFAULT_SCRIPT_NUM_LENGTH_POLICY_AFTER_CHRONICLE
    }
    return Interp.DEFAULT_SCRIPT_NUM_LENGTH_POLICY_AFTER_GENESIS
  }

  maxScriptElementSize () {
    return this.isPreGenesis()
      ? Interp.PREGENESIS_MAX_SCRIPT_ELEMENT_SIZE
      : Interp.MAX_SCRIPT_ELEMENT_SIZE
  }

  versionBuf () {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(this.tx ? this.tx.versionBytesNum : 0, 0)
    return buf
  }

  buildSubScript () {
    let chunks = this.script.chunks.slice(this.pBeginCodeHash)
    // Chronicle: OP_CHECKSIG in the unlocking script signs the remainder of
    // the locking script as well (last OP_CODESEPARATOR to the end).
    if (this.isUnlockingScript && this.isChronicle() && this.lockingScript) {
      chunks = chunks.concat(this.lockingScript.chunks)
    }
    return new Script().fromObject({ chunks })
  }


  stepChronicleOp (opCodeNum, fRequireMinimal) {
    const isSubstr = opCodeNum === OpCode.OP_SUBSTR_CHRONICLE
    if (this.stack.length < (isSubstr ? 3 : 2)) {
      this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
      return false
    }
    let len
    let offset = 0
    let bits
    let bn
    try {
      const lbuf = this.stack[this.stack.length - 1]
      const parsed = new Bn().fromScriptNumBuffer(
        lbuf,
        fRequireMinimal,
        this.scriptNumMaxSize()
      )
      if (isSubstr || opCodeNum === OpCode.OP_LEFT_CHRONICLE ||
          opCodeNum === OpCode.OP_RIGHT_CHRONICLE) {
        len = parsed.toNumber()
      } else {
        bits = parsed.toNumber()
      }
      if (isSubstr) {
        const obuf = this.stack[this.stack.length - 2]
        offset = new Bn()
          .fromScriptNumBuffer(obuf, fRequireMinimal, this.scriptNumMaxSize())
          .toNumber()
      } else if (!isSubstr) {
        const vbuf = this.stack[this.stack.length - 2]
        bn = new Bn().fromScriptNumBuffer(
          vbuf,
          fRequireMinimal,
          this.scriptNumMaxSize()
        )
      }
    } catch (e) {
      this.errStr = e.message.includes('overflow')
        ? 'SCRIPTNUM_OVERFLOW'
        : 'SCRIPT_ERR_UNKNOWN_ERROR'
      return false
    }

    if (isSubstr || opCodeNum === OpCode.OP_LEFT_CHRONICLE ||
        opCodeNum === OpCode.OP_RIGHT_CHRONICLE) {
      const dataIdx = this.stack.length - (isSubstr ? 3 : 2)
      const data = this.stack[dataIdx]
      const size = data.length
      if (
        len < 0 || len > size ||
        (isSubstr && (offset < 0 || offset >= size || len > size - offset))
      ) {
        this.errStr = 'SCRIPT_ERR_INVALID_NUMBER_RANGE'
        return false
      }
      const start = isSubstr
        ? offset
        : opCodeNum === OpCode.OP_LEFT_CHRONICLE ? 0 : size - len
      this.stack[dataIdx] = data.slice(start, start + len)
      this.stack.pop()
      if (isSubstr) this.stack.pop()
      return true
    }

    if (bits < 0) {
      this.errStr = 'SCRIPT_ERR_INVALID_NUMBER_RANGE'
      return false
    }
    const negative = bn.negative
    const abs = bn.abs()
    let result = opCodeNum === OpCode.OP_LSHIFTNUM
      ? abs.ushln(bits)
      : abs.ushrn(bits)
    if (negative) result = result.ineg()
    this.stack.pop()
    this.stack.pop()
    this.stack.push(result.toScriptNumBuffer())
    return true
  }

  static castToBool (buf) {
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] !== 0) {
        // can be negative zero
        if (i === buf.length - 1 && buf[i] === 0x80) {
          return false
        }
        return true
      }
    }
    return false
  }

  /**
   * Translated from bitcoin core's CheckSigEncoding
   */
  checkSigEncoding (buf) {
    // Empty signature. Not strictly DER encoded, but allowed to provide a
    // compact way to provide an invalid signature for use with CHECK(MULTI)SIG
    if (buf.length === 0) {
      return true
    }
    if (
      (this.flags &
        (Interp.SCRIPT_VERIFY_DERSIG |
          Interp.SCRIPT_VERIFY_LOW_S |
          Interp.SCRIPT_VERIFY_STRICTENC)) !==
        0 &&
      !Sig.IsTxDer(buf)
    ) {
      this.errStr = 'SCRIPT_ERR_SIG_DER'
      return false
    } else if (
      (this.flags & Interp.SCRIPT_VERIFY_LOW_S) !== 0 &&
      !this.isChronicle()
    ) {
      const sig = new Sig().fromTxFormat(buf)
      if (!sig.hasLowS()) {
        this.errStr = 'SCRIPT_ERR_SIG_DER'
        return false
      }
    } else if ((this.flags & Interp.SCRIPT_VERIFY_STRICTENC) !== 0) {
      const sig = new Sig().fromTxFormat(buf)
      if (!sig.hasDefinedHashType()) {
        this.errStr = 'SCRIPT_ERR_SIG_HASHTYPE'
        return false
      }
      if (
        !(this.flags & Interp.SCRIPT_ENABLE_SIGHASH_FORKID) &&
        sig.nHashType & Sig.SIGHASH_FORKID
      ) {
        this.errStr = 'SCRIPT_ERR_ILLEGAL_FORKID'
        return false
      }
      if (sig.isChronicle() && !this.isChronicle()) {
        this.errStr = 'SCRIPT_ERR_ILLEGAL_CHRONICLE'
        return false
      }
      if (
        this.flags & Interp.SCRIPT_ENABLE_SIGHASH_FORKID &&
        !(sig.nHashType & Sig.SIGHASH_FORKID) &&
        this.flags & Interp.SCRIPT_VERIFY_STRICTENC
      ) {
        this.errStr = 'SCRIPT_ERR_MUST_USE_FORKID'
        return false
      }
    }
    return true
  }

  /**
   * Translated from bitcoin core's CheckPubKeyEncoding
   */
  checkPubKeyEncoding (buf) {
    if (
      (this.flags & Interp.SCRIPT_VERIFY_STRICTENC) !== 0 &&
      !PubKey.isCompressedOrUncompressed(buf)
    ) {
      this.errStr = 'SCRIPT_ERR_PUBKEYTYPE'
      return false
    }
    return true
  }

  /**
   * Translated from bitcoin core's CheckLockTime
   */
  checkLockTime (nLockTime) {
    // We actually want to compare the nLockTime of the transaction with the
    // cumulative lock time of the script.
    //
    // However, the transaction's nLockTime is a uint32, while the script's
    // nLockTime is a 5-byte big number.  The cumulative lock time of the script
    // is restricted to being a uint32 by CheckLockTimeVerify.
    if (
      !(
        (this.tx.nLockTime < Interp.LOCKTIME_THRESHOLD &&
          nLockTime < Interp.LOCKTIME_THRESHOLD) ||
        (this.tx.nLockTime >= Interp.LOCKTIME_THRESHOLD &&
          nLockTime >= Interp.LOCKTIME_THRESHOLD)
      )
    ) {
      return false
    }

    // Now that we know they're the same type, we can compare them.
    if (nLockTime > this.tx.nLockTime) {
      return false
    }

    // Finally, the nSequence of the input being spent must not be
    // 0xffffffff.
    if (this.tx.txIns[this.nIn].nSequence === 0xffffffff) {
      return false
    }

    return true
  }

  /**
   * Translated from bitcoin core's CheckSequence
   */
  checkSequence (nSequence) {
    // Relative lock times are supported if the nVersion of the transaction
    // is greater than or equal to 2.
    if (this.tx.versionBytesNum < 2) {
      return false
    }

    // If the nSequence of the input being spent has its "disable" flag set,
    // then relative lock times are disabled for that input.
    if ((this.tx.txIns[this.nIn].nSequence & TxIn.SEQUENCE_LOCKTIME_DISABLE_FLAG) !== 0) {
      return false
    }

    // Mask off any non-consensus bits.
    const nLockTimeMask =
      TxIn.SEQUENCE_LOCKTIME_TYPE_FLAG | TxIn.SEQUENCE_LOCKTIME_MASK
    const txSequenceMasked = this.tx.txIns[this.nIn].nSequence & nLockTimeMask
    const nSequenceMasked = nSequence & nLockTimeMask

    // We can only compare two lock times if they're the same type.
    if (
      !(
        (txSequenceMasked < TxIn.SEQUENCE_LOCKTIME_TYPE_FLAG &&
          nSequenceMasked < TxIn.SEQUENCE_LOCKTIME_TYPE_FLAG) ||
        (txSequenceMasked >= TxIn.SEQUENCE_LOCKTIME_TYPE_FLAG &&
          nSequenceMasked >= TxIn.SEQUENCE_LOCKTIME_TYPE_FLAG)
      )
    ) {
      return false
    }

    // Now that we know they're the same type, we can compare them.
    if (nSequenceMasked > txSequenceMasked) {
      return false
    }

    return true
  }

  /**
   * Based on bitcoin core's EvalScript, but this method only evaluates one
   * opcode and then returns. To evaluate an entire script, use eval().
   */
  * step () {
    const fRequireMinimal =
      (this.flags & Interp.SCRIPT_VERIFY_MINIMALDATA) !== 0 &&
      !this.isChronicle()

    if (this.pc >= this.script.chunks.length) {
      return true
    }

    const chunk = this.script.chunks[this.pc]
    this.pc++
    const opCodeNum = chunk.opCodeNum
    const fExec = this.ifStack.indexOf(false) === -1

    if (chunk.buf && chunk.buf.length > this.maxScriptElementSize()) {
      this.errStr = 'SCRIPT_ERR_PUSH_SIZE'
      return false
    }

    // Note how OpCode.OP_RESERVED does not count towards the opCode limit.
    if (opCodeNum > OpCode.OP_16 && ++this.nOpCount > 201) {
      this.errStr = 'SCRIPT_ERR_OP_COUNT'
      return false
    }

    if (
      (opCodeNum === OpCode.OP_2MUL ||
        opCodeNum === OpCode.OP_2DIV) &&
      !this.isChronicle()
    ) {
      this.errStr = 'SCRIPT_ERR_DISABLED_OPCODE'
      return false
    }

    if (fExec && opCodeNum >= 0 && opCodeNum <= OpCode.OP_PUSHDATA4) {
      if (fRequireMinimal && !this.script.checkMinimalPush(this.pc - 1)) {
        this.errStr = 'SCRIPT_ERR_MINIMALDATA'
        return false
      }
      if (!chunk.buf) {
        this.stack.push(Interp.false)
      } else if (chunk.len !== chunk.buf.length) {
        throw new Error('length of push value not equal to length of data')
      } else {
        this.stack.push(chunk.buf)
      }
    } else if (
      fExec ||
      (OpCode.OP_IF <= opCodeNum && opCodeNum <= OpCode.OP_ENDIF)
    ) {
      switch (opCodeNum) {
        //
        // Push value
        //
        case OpCode.OP_1NEGATE:
        case OpCode.OP_1:
        case OpCode.OP_2:
        case OpCode.OP_3:
        case OpCode.OP_4:
        case OpCode.OP_5:
        case OpCode.OP_6:
        case OpCode.OP_7:
        case OpCode.OP_8:
        case OpCode.OP_9:
        case OpCode.OP_10:
        case OpCode.OP_11:
        case OpCode.OP_12:
        case OpCode.OP_13:
        case OpCode.OP_14:
        case OpCode.OP_15:
        case OpCode.OP_16:
          {
            // ( -- value)
            // ScriptNum bn((int)opCode - (int)(OpCode.OP_1 - 1))
            let n = opCodeNum - (OpCode.OP_1 - 1)
            let buf = new Bn(n).toScriptNumBuffer()
            this.stack.push(buf)
          }
          break

        //
        // Control
        //
        case OpCode.OP_NOP:
          break

        case OpCode.OP_CHECKLOCKTIMEVERIFY:
          {
            if (!(this.flags & Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY)) {
              // not enabled; treat as a NOP2
              if (
                this.flags & Interp.SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS
              ) {
                this.errStr = 'SCRIPT_ERR_DISCOURAGE_UPGRADABLE_NOPS'
                return false
              }
              break
            }

            if (this.stack.length < 1) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }

            let nLockTime
            try {
              const nLockTimebuf = this.stack[this.stack.length - 1]
              const nLockTimebn = new Bn().fromScriptNumBuffer(
                nLockTimebuf,
                fRequireMinimal,
                5
              )
              nLockTime = nLockTimebn.toNumber()
            } catch (e) {
              this.errStr = e.message.includes('minimal') ? 'SCRIPT_ERR_UNKNOWN_ERROR' : 'SCRIPT_ERR_UNKNOWN_ERROR'
              if (e.message.includes('overflow')) this.errStr = 'SCRIPTNUM_OVERFLOW'
              if (e.message.includes('minimal')) this.errStr = 'SCRIPT_ERR_MINIMALDATA'
              return false
            }

            if (nLockTime < 0) {
              this.errStr = 'SCRIPT_ERR_NEGATIVE_LOCKTIME'
              return false
            }

            if (!this.checkLockTime(nLockTime)) {
              this.errStr = 'SCRIPT_ERR_UNSATISFIED_LOCKTIME'
              return false
            }
          }
          break

        case OpCode.OP_CHECKSEQUENCEVERIFY:
          {
            if (!(this.flags & Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY)) {
              // not enabled; treat as a NOP3
              if (
                this.flags & Interp.SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS
              ) {
                this.errStr = 'SCRIPT_ERR_DISCOURAGE_UPGRADABLE_NOPS'
                return false
              }
              break
            }

            if (this.stack.length < 1) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }

            let nSequence
            try {
              const nSequencebuf = this.stack[this.stack.length - 1]
              const nSequencebn = new Bn().fromScriptNumBuffer(
                nSequencebuf,
                fRequireMinimal,
                5
              )
              nSequence = nSequencebn.toNumber()
            } catch (e) {
              this.errStr = 'SCRIPTNUM_OVERFLOW'
              return false
            }

            if (nSequence < 0) {
              this.errStr = 'SCRIPT_ERR_NEGATIVE_LOCKTIME'
              return false
            }

            if ((nSequence & TxIn.SEQUENCE_LOCKTIME_DISABLE_FLAG) !== 0) {
              break
            }

            if (!this.checkSequence(nSequence)) {
              this.errStr = 'SCRIPT_ERR_UNSATISFIED_LOCKTIME'
              return false
            }
          }
          break

        case OpCode.OP_NOP1:
        case OpCode.OP_NOP3:
        case OpCode.OP_NOP4:
        case OpCode.OP_NOP5:
        case OpCode.OP_NOP6:
        case OpCode.OP_NOP7:
        case OpCode.OP_NOP8:
        case OpCode.OP_NOP9:
        case OpCode.OP_NOP10:
          {
            if (
              this.isChronicle() &&
              (opCodeNum === OpCode.OP_SUBSTR_CHRONICLE ||
                opCodeNum === OpCode.OP_LEFT_CHRONICLE ||
                opCodeNum === OpCode.OP_RIGHT_CHRONICLE ||
                opCodeNum === OpCode.OP_LSHIFTNUM ||
                opCodeNum === OpCode.OP_RSHIFTNUM)
            ) {
              return this.stepChronicleOp(opCodeNum, fRequireMinimal)
            }
          }
          if (this.flags & Interp.SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS) {
            this.errStr = 'SCRIPT_ERR_DISCOURAGE_UPGRADABLE_NOPS'
            return false
          }
          break

        case OpCode.OP_IF:
        case OpCode.OP_NOTIF:
        case OpCode.OP_VERIF:
        case OpCode.OP_VERNOTIF:
          {
            if (
              (opCodeNum === OpCode.OP_VERIF ||
                opCodeNum === OpCode.OP_VERNOTIF) &&
              !this.isChronicle()
            ) {
              this.errStr = 'SCRIPT_ERR_BAD_OPCODE'
              return false
            }
            let fValue = false
            if (fExec) {
              if (this.stack.length < 1) {
                this.errStr = 'SCRIPT_ERR_UNBALANCED_CONDITIONAL'
                return false
              }
              const buf = this.stack.pop()
              if (
                opCodeNum === OpCode.OP_VERIF ||
                opCodeNum === OpCode.OP_VERNOTIF
              ) {
                fValue = buf.length === 4 && buf.equals(this.versionBuf())
              } else {
                fValue = Interp.castToBool(buf)
              }
              if (
                opCodeNum === OpCode.OP_NOTIF ||
                opCodeNum === OpCode.OP_VERNOTIF
              ) {
                fValue = !fValue
              }
            }
            this.ifStack.push(fValue)
          }
          break

        case OpCode.OP_ELSE:
          if (this.ifStack.length === 0) {
            this.errStr = 'SCRIPT_ERR_UNBALANCED_CONDITIONAL'
            return false
          }
          this.ifStack[this.ifStack.length - 1] = !this.ifStack[
            this.ifStack.length - 1
          ]
          break

        case OpCode.OP_ENDIF:
          if (this.ifStack.length === 0) {
            this.errStr = 'SCRIPT_ERR_UNBALANCED_CONDITIONAL'
            return false
          }
          this.ifStack.pop()
          break

        case OpCode.OP_VER:
          {
            if (!this.isChronicle()) {
              this.errStr = 'SCRIPT_ERR_BAD_OPCODE'
              return false
            }
            this.stack.push(this.versionBuf())
          }
          break

        case OpCode.OP_VERIFY:
          {
            if (this.stack.length < 1) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const buf = this.stack[this.stack.length - 1]
            const fValue = Interp.castToBool(buf)
            if (fValue) {
              this.stack.pop()
            } else {
              this.errStr = 'SCRIPT_ERR_VERIFY'
              return false
            }
          }
          break

        case OpCode.OP_RETURN: {
          // Chronicle: OP_RETURN in the unlocking script only ends that
          // script's execution; the locking script still runs.
          if (this.isUnlockingScript && this.isChronicle()) {
            this.pc = this.script.chunks.length
            return true
          }
          this.errStr = 'SCRIPT_ERR_OP_RETURN'
          return false
        }

        //
        // Stack ops
        //
        case OpCode.OP_TOALTSTACK:
          if (this.stack.length < 1) {
            this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
            return false
          }
          this.altStack.push(this.stack.pop())
          break

        case OpCode.OP_FROMALTSTACK:
          if (this.altStack.length < 1) {
            this.errStr = 'SCRIPT_ERR_INVALID_ALTSTACK_OPERATION'
            return false
          }
          this.stack.push(this.altStack.pop())
          break

        case OpCode.OP_2DROP:
          if (this.stack.length < 2) {
            this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
            return false
          }
          this.stack.pop()
          this.stack.pop()
          break

        case OpCode.OP_2DUP:
          {
            if (this.stack.length < 2) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const buf1 = this.stack[this.stack.length - 2]
            const buf2 = this.stack[this.stack.length - 1]
            this.stack.push(buf1)
            this.stack.push(buf2)
          }
          break

        case OpCode.OP_3DUP:
          {
            if (this.stack.length < 3) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const buf1 = this.stack[this.stack.length - 3]
            const buf2 = this.stack[this.stack.length - 2]
            const buf3 = this.stack[this.stack.length - 1]
            this.stack.push(buf1)
            this.stack.push(buf2)
            this.stack.push(buf3)
          }
          break

        case OpCode.OP_2OVER:
          {
            if (this.stack.length < 4) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const buf1 = this.stack[this.stack.length - 4]
            const buf2 = this.stack[this.stack.length - 3]
            this.stack.push(buf1)
            this.stack.push(buf2)
          }
          break

        case OpCode.OP_2ROT:
          {
            if (this.stack.length < 6) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const spliced = this.stack.splice(this.stack.length - 6, 2)
            this.stack.push(spliced[0])
            this.stack.push(spliced[1])
          }
          break

        case OpCode.OP_2SWAP:
          {
            if (this.stack.length < 4) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const spliced = this.stack.splice(this.stack.length - 4, 2)
            this.stack.push(spliced[0])
            this.stack.push(spliced[1])
          }
          break

        case OpCode.OP_IFDUP:
          {
            if (this.stack.length < 1) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const buf = this.stack[this.stack.length - 1]
            const fValue = Interp.castToBool(buf)
            if (fValue) {
              this.stack.push(buf)
            }
          }
          break

        case OpCode.OP_DEPTH:
          {
            const buf = new Bn(this.stack.length).toScriptNumBuffer()
            this.stack.push(buf)
          }
          break

        case OpCode.OP_DROP:
          if (this.stack.length < 1) {
            this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
            return false
          }
          this.stack.pop()
          break

        case OpCode.OP_DUP:
          if (this.stack.length < 1) {
            this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
            return false
          }
          this.stack.push(this.stack[this.stack.length - 1])
          break

        case OpCode.OP_NIP:
          if (this.stack.length < 2) {
            this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
            return false
          }
          this.stack.splice(this.stack.length - 2, 1)
          break

        case OpCode.OP_OVER:
          if (this.stack.length < 2) {
            this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
            return false
          }
          this.stack.push(this.stack[this.stack.length - 2])
          break

        case OpCode.OP_PICK:
        case OpCode.OP_ROLL:
          {
            if (this.stack.length < 2) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            let n
            try {
              const buf = this.stack[this.stack.length - 1]
              const bn = new Bn().fromScriptNumBuffer(buf, fRequireMinimal, this.scriptNumMaxSize())
              n = bn.toNumber()
            } catch (e) {
              this.errStr = e.message.includes('overflow') ? 'SCRIPTNUM_OVERFLOW' : 'SCRIPT_ERR_UNKNOWN_ERROR'
              return false
            }
            this.stack.pop()
            if (n < 0 || n >= this.stack.length) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const buf = this.stack[this.stack.length - n - 1]
            if (opCodeNum === OpCode.OP_ROLL) {
              this.stack.splice(this.stack.length - n - 1, 1)
            }
            this.stack.push(buf)
          }
          break

        case OpCode.OP_ROT:
          {
            if (this.stack.length < 3) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const x1 = this.stack[this.stack.length - 3]
            const x2 = this.stack[this.stack.length - 2]
            const x3 = this.stack[this.stack.length - 1]
            this.stack[this.stack.length - 3] = x2
            this.stack[this.stack.length - 2] = x3
            this.stack[this.stack.length - 1] = x1
          }
          break

        case OpCode.OP_SWAP:
          {
            if (this.stack.length < 2) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const x1 = this.stack[this.stack.length - 2]
            const x2 = this.stack[this.stack.length - 1]
            this.stack[this.stack.length - 2] = x2
            this.stack[this.stack.length - 1] = x1
          }
          break

        case OpCode.OP_TUCK:
          if (this.stack.length < 2) {
            this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
            return false
          }
          this.stack.splice(
            this.stack.length - 2,
            0,
            this.stack[this.stack.length - 1]
          )
          break

        case OpCode.OP_SIZE:
          {
            if (this.stack.length < 1) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const bn = new Bn(this.stack[this.stack.length - 1].length)
            this.stack.push(bn.toScriptNumBuffer())
          }
          break

        //
        // Bitwise logic
        //
        case OpCode.OP_AND:
        case OpCode.OP_OR:
        case OpCode.OP_XOR:
          {
            if (this.stack.length < 2) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const buf1 = this.stack[this.stack.length - 2]
            const buf2 = this.stack[this.stack.length - 1]

            if (buf1.length !== buf2.length) {
              this.errStr = 'SCRIPT_ERR_INVALID_OPERAND_SIZE'
              return false
            }

            switch (opCodeNum) {
              case OpCode.OP_AND:
                for (let i = 0; i < buf1.length; i++) {
                  buf1[i] &= buf2[i]
                }
                break
              case OpCode.OP_OR:
                for (let i = 0; i < buf1.length; i++) {
                  buf1[i] |= buf2[i]
                }
                break
              case OpCode.OP_XOR:
                for (let i = 0; i < buf1.length; i++) {
                  buf1[i] ^= buf2[i]
                }
                break
            }
            this.stack.pop()
          }
          break

        case OpCode.OP_INVERT:
          {
            if (this.stack.length < 1) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const buf = this.stack[this.stack.length - 1]
            for (let i = 0; i < buf.length; i++) {
              buf[i] = ~buf[i]
            }
          }
          break

        case OpCode.OP_LSHIFT:
        case OpCode.OP_RSHIFT:
          {
            if (this.stack.length < 2) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }

            const buf1 = this.stack[this.stack.length - 2]
            let value = new Bn(buf1)
            let n
            try {
              const nbuf = this.stack[this.stack.length - 1]
              const bn = new Bn().fromScriptNumBuffer(
                nbuf,
                fRequireMinimal,
                this.scriptNumMaxSize()
              )
              n = bn.toNumber()
            } catch (e) {
              this.errStr = e.message.includes('overflow') ? 'SCRIPTNUM_OVERFLOW' : 'SCRIPT_ERR_UNKNOWN_ERROR'
              return false
            }

            if (n < 0) {
              this.errStr = 'SCRIPT_ERR_INVALID_NUMBER_RANGE'
              return false
            }

            this.stack.pop()
            this.stack.pop()

            switch (opCodeNum) {
              case OpCode.OP_LSHIFT:
                value = value.shln(n)
                break
              case OpCode.OP_RSHIFT:
                value = value.shrn(n)
                break
            }

            let buf2 = value.toBuffer({ endian: 'big' })
            if (buf2.length > buf1.length) {
              buf2 = buf2.slice(buf2.length - buf1.length)
            } else if (buf2.length < buf1.length) {
              buf2 = Buffer.concat([Buffer.alloc(buf1.length - buf2.length), buf2])
            }

            this.stack.push(buf2)
          }
          break

        case OpCode.OP_EQUAL:
        case OpCode.OP_EQUALVERIFY:
          {
            if (this.stack.length < 2) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const buf1 = this.stack[this.stack.length - 2]
            const buf2 = this.stack[this.stack.length - 1]
            const fEqual = cmp(buf1, buf2)
            this.stack.pop()
            this.stack.pop()
            this.stack.push(fEqual ? Interp.true : Interp.false)
            if (opCodeNum === OpCode.OP_EQUALVERIFY) {
              if (fEqual) {
                this.stack.pop()
              } else {
                this.errStr = 'SCRIPT_ERR_EQUALVERIFY'
                return false
              }
            }
          }
          break

        //
        // Numeric
        //
        case OpCode.OP_1ADD:
        case OpCode.OP_1SUB:
        case OpCode.OP_2MUL:
        case OpCode.OP_2DIV:
        case OpCode.OP_NEGATE:
        case OpCode.OP_ABS:
        case OpCode.OP_NOT:
        case OpCode.OP_0NOTEQUAL:
          {
            if (
              (opCodeNum === OpCode.OP_2MUL ||
                opCodeNum === OpCode.OP_2DIV) &&
              !this.isChronicle()
            ) {
              this.errStr = 'SCRIPT_ERR_BAD_OPCODE'
              return false
            }
            if (this.stack.length < 1) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const buf = this.stack[this.stack.length - 1]
            let bn
            try {
              bn = new Bn().fromScriptNumBuffer(buf, fRequireMinimal, this.scriptNumMaxSize())
            } catch (e) {
              this.errStr = e.message.includes('overflow') ? 'SCRIPTNUM_OVERFLOW' : 'SCRIPT_ERR_UNKNOWN_ERROR'
              return false
            }
            switch (opCodeNum) {
              case OpCode.OP_1ADD:
                bn = bn.add(1)
                break
              case OpCode.OP_1SUB:
                bn = bn.sub(1)
                break
              case OpCode.OP_2MUL:
                bn = bn.add(bn)
                break
              case OpCode.OP_2DIV:
                bn = bn.div(new Bn(2))
                break
              case OpCode.OP_NEGATE:
                bn = bn.neg()
                break
              case OpCode.OP_ABS:
                if (bn.lt(0)) bn = bn.neg()
                break
              case OpCode.OP_NOT:
                bn = new Bn(bn.eq(0) ? 1 : 0)
                break
              case OpCode.OP_0NOTEQUAL:
                bn = new Bn(bn.neq(0) ? 1 : 0)
                break
            }
            this.stack.pop()
            this.stack.push(bn.toScriptNumBuffer())
          }
          break

        case OpCode.OP_ADD:
        case OpCode.OP_SUB:
        case OpCode.OP_MUL:
        case OpCode.OP_DIV:
        case OpCode.OP_MOD:
        case OpCode.OP_BOOLAND:
        case OpCode.OP_BOOLOR:
        case OpCode.OP_NUMEQUAL:
        case OpCode.OP_NUMEQUALVERIFY:
        case OpCode.OP_NUMNOTEQUAL:
        case OpCode.OP_LESSTHAN:
        case OpCode.OP_GREATERTHAN:
        case OpCode.OP_LESSTHANOREQUAL:
        case OpCode.OP_GREATERTHANOREQUAL:
        case OpCode.OP_MIN:
        case OpCode.OP_MAX:
          {
            if (this.stack.length < 2) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            let bn1, bn2
            try {
              bn1 = new Bn().fromScriptNumBuffer(
                this.stack[this.stack.length - 2],
                fRequireMinimal,
                this.scriptNumMaxSize()
              )
              bn2 = new Bn().fromScriptNumBuffer(
                this.stack[this.stack.length - 1],
                fRequireMinimal,
                this.scriptNumMaxSize()
              )
            } catch (e) {
              this.errStr = e.message.includes('overflow') ? 'SCRIPTNUM_OVERFLOW' : 'SCRIPT_ERR_UNKNOWN_ERROR'
              return false
            }
            let bn = new Bn(0)

            switch (opCodeNum) {
              case OpCode.OP_ADD:
                bn = bn1.add(bn2)
                break
              case OpCode.OP_SUB:
                bn = bn1.sub(bn2)
                break
              case OpCode.OP_MUL:
                bn = bn1.mul(bn2)
                break
              case OpCode.OP_DIV:
                if (bn2.eq(0)) {
                  this.errStr = 'SCRIPT_ERR_DIV_BY_ZERO'
                  return false
                }
                bn = bn1.div(bn2)
                break
              case OpCode.OP_MOD:
                if (bn2.eq(0)) {
                  this.errStr = 'SCRIPT_ERR_DIV_BY_ZERO'
                  return false
                }
                bn = bn1.mod(bn2)
                break
              case OpCode.OP_BOOLAND:
                bn = new Bn((bn1.neq(0) && bn2.neq(0)) ? 1 : 0)
                break
              case OpCode.OP_BOOLOR:
                bn = new Bn((bn1.neq(0) || bn2.neq(0)) ? 1 : 0)
                break
              case OpCode.OP_NUMEQUAL:
                bn = new Bn(bn1.eq(bn2) ? 1 : 0)
                break
              case OpCode.OP_NUMEQUALVERIFY:
                bn = new Bn(bn1.eq(bn2) ? 1 : 0)
                break
              case OpCode.OP_NUMNOTEQUAL:
                bn = new Bn(bn1.neq(bn2) ? 1 : 0)
                break
              case OpCode.OP_LESSTHAN:
                bn = new Bn(bn1.lt(bn2) ? 1 : 0)
                break
              case OpCode.OP_GREATERTHAN:
                bn = new Bn(bn1.gt(bn2) ? 1 : 0)
                break
              case OpCode.OP_LESSTHANOREQUAL:
                bn = new Bn(bn1.leq(bn2) ? 1 : 0)
                break
              case OpCode.OP_GREATERTHANOREQUAL:
                bn = new Bn(bn1.geq(bn2) ? 1 : 0)
                break
              case OpCode.OP_MIN:
                bn = bn1.lt(bn2) ? bn1 : bn2
                break
              case OpCode.OP_MAX:
                bn = bn1.gt(bn2) ? bn1 : bn2
                break
            }
            this.stack.pop()
            this.stack.pop()
            this.stack.push(bn.toScriptNumBuffer())

            if (opCodeNum === OpCode.OP_NUMEQUALVERIFY) {
              if (Interp.castToBool(this.stack[this.stack.length - 1])) {
                this.stack.pop()
              } else {
                this.errStr = 'SCRIPT_ERR_NUMEQUALVERIFY'
                return false
              }
            }
          }
          break

        case OpCode.OP_WITHIN:
          {
            if (this.stack.length < 3) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            let bn1, bn2, bn3
            try {
              bn1 = new Bn().fromScriptNumBuffer(
                this.stack[this.stack.length - 3],
                fRequireMinimal,
                this.scriptNumMaxSize()
              )
              bn2 = new Bn().fromScriptNumBuffer(
                this.stack[this.stack.length - 2],
                fRequireMinimal,
                this.scriptNumMaxSize()
              )
              bn3 = new Bn().fromScriptNumBuffer(
                this.stack[this.stack.length - 1],
                fRequireMinimal,
                this.scriptNumMaxSize()
              )
            } catch (e) {
              this.errStr = e.message.includes('overflow') ? 'SCRIPTNUM_OVERFLOW' : 'SCRIPT_ERR_UNKNOWN_ERROR'
              return false
            }
            const fValue = bn2.leq(bn1) && bn1.lt(bn3)
            this.stack.pop()
            this.stack.pop()
            this.stack.pop()
            this.stack.push(fValue ? Interp.true : Interp.false)
          }
          break

        //
        // Crypto
        //
        case OpCode.OP_RIPEMD160:
        case OpCode.OP_SHA1:
        case OpCode.OP_SHA256:
        case OpCode.OP_HASH160:
        case OpCode.OP_HASH256:
          {
            if (this.stack.length < 1) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const buf = this.stack[this.stack.length - 1]
            let bufHash
            if (opCodeNum === OpCode.OP_RIPEMD160) {
              bufHash = Hash.ripemd160(buf)
            } else if (opCodeNum === OpCode.OP_SHA1) {
              bufHash = Hash.sha1(buf)
            } else if (opCodeNum === OpCode.OP_SHA256) {
              bufHash = Hash.sha256(buf)
            } else if (opCodeNum === OpCode.OP_HASH160) {
              bufHash = Hash.sha256Ripemd160(buf)
            } else if (opCodeNum === OpCode.OP_HASH256) {
              bufHash = Hash.sha256Sha256(buf)
            }
            this.stack.pop()
            this.stack.push(bufHash)
          }
          break

        case OpCode.OP_CODESEPARATOR:
          this.pBeginCodeHash = this.pc
          break

        case OpCode.OP_CHECKSIG:
        case OpCode.OP_CHECKSIGVERIFY:
          {
            if (this.stack.length < 2) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }

            const bufSig = this.stack[this.stack.length - 2]
            const bufPubKey = this.stack[this.stack.length - 1]
            if (
              !this.checkSigEncoding(bufSig) ||
              !this.checkPubKeyEncoding(bufPubKey)
            ) {
              return false
            }

            const subScript = this.buildSubScript()
            const nHashType =
              bufSig.length > 0 ? bufSig.readUInt8(bufSig.length - 1) : 0
            if (nHashType & Sig.SIGHASH_FORKID) {
              if (!(this.flags & Interp.SCRIPT_ENABLE_SIGHASH_FORKID)) {
                this.errStr = 'SCRIPT_ERR_ILLEGAL_FORKID'
                return false
              }
            } else {
              subScript.findAndDelete(new Script().writeBuffer(bufSig))
            }

            let fSuccess
            try {
              const sig = new Sig().fromTxFormat(bufSig)
              const pubKey = new PubKey().fromBuffer(bufPubKey, false)
              fSuccess = this.tx.verify(
                sig,
                pubKey,
                this.nIn,
                subScript,
                Boolean(this.flags & Interp.SCRIPT_VERIFY_LOW_S) && !this.isChronicle(),
                this.valueBn,
                this.flags
              )
            } catch (e) {
              fSuccess = false
            }

            this.stack.pop()
            this.stack.pop()
            this.stack.push(fSuccess ? Interp.true : Interp.false)
            if (opCodeNum === OpCode.OP_CHECKSIGVERIFY) {
              if (fSuccess) {
                this.stack.pop()
              } else {
                this.errStr = 'SCRIPT_ERR_CHECKSIGVERIFY'
                return false
              }
            }
          }
          break

        case OpCode.OP_CHECKMULTISIG:
        case OpCode.OP_CHECKMULTISIGVERIFY:
          {
            let i = 1
            if (this.stack.length < i) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }

            let nKeysCount
            try {
              const buf = this.stack[this.stack.length - i]
              nKeysCount = new Bn().fromScriptNumBuffer(buf, fRequireMinimal).toNumber()
            } catch (e) {
              this.errStr = e.message.includes('overflow') ? 'SCRIPTNUM_OVERFLOW' : 'SCRIPT_ERR_UNKNOWN_ERROR'
              return false
            }

            if (nKeysCount < 0 || nKeysCount > 20) {
              this.errStr = 'SCRIPT_ERR_PUBKEY_COUNT'
              return false
            }
            this.nOpCount += nKeysCount
            if (this.nOpCount > 201) {
              this.errStr = 'SCRIPT_ERR_OP_COUNT'
              return false
            }
            let ikey = ++i
            i += nKeysCount
            if (this.stack.length < i) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }

            let nSigsCount
            try {
              const buf = this.stack[this.stack.length - i]
              nSigsCount = new Bn().fromScriptNumBuffer(buf, fRequireMinimal).toNumber()
            } catch (e) {
              this.errStr = e.message.includes('overflow') ? 'SCRIPTNUM_OVERFLOW' : 'SCRIPT_ERR_UNKNOWN_ERROR'
              return false
            }

            if (nSigsCount < 0 || nSigsCount > nKeysCount) {
              this.errStr = 'SCRIPT_ERR_SIG_COUNT'
              return false
            }
            let isig = ++i
            i += nSigsCount
            if (this.stack.length < i) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }

            const subScript = this.buildSubScript()

            for (let k = 0; k < nSigsCount; k++) {
              const bufSig = this.stack[this.stack.length - isig - k]
              const nHashType =
                bufSig.length > 0 ? bufSig.readUInt8(bufSig.length - 1) : 0
              if (nHashType & Sig.SIGHASH_FORKID) {
                if (!(this.flags & Interp.SCRIPT_ENABLE_SIGHASH_FORKID)) {
                  this.errStr = 'SCRIPT_ERR_ILLEGAL_FORKID'
                  return false
                }
              } else {
                subScript.findAndDelete(new Script().writeBuffer(bufSig))
              }
            }

            let fSuccess = true
            while (fSuccess && nSigsCount > 0) {
              const bufSig = this.stack[this.stack.length - isig]
              const bufPubKey = this.stack[this.stack.length - ikey]

              if (
                !this.checkSigEncoding(bufSig) ||
                !this.checkPubKeyEncoding(bufPubKey)
              ) {
                return false
              }

              let fOk
              try {
                const sig = new Sig().fromTxFormat(bufSig)
                const pubKey = new PubKey().fromBuffer(bufPubKey, false)
                fOk = this.tx.verify(
                  sig,
                  pubKey,
                  this.nIn,
                  subScript,
                  Boolean(this.flags & Interp.SCRIPT_VERIFY_LOW_S) && !this.isChronicle(),
                  this.valueBn,
                  this.flags
                )
              } catch (e) {
                fOk = false
              }

              if (fOk) {
                isig++
                nSigsCount--
              }
              ikey++
              nKeysCount--

              if (nSigsCount > nKeysCount) {
                fSuccess = false
              }
            }

            while (i-- > 1) {
              this.stack.pop()
            }

            if (this.stack.length < 1) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            if (
              this.flags & Interp.SCRIPT_VERIFY_NULLDUMMY &&
              !this.isChronicle() &&
              this.stack[this.stack.length - 1].length
            ) {
              this.errStr = 'SCRIPT_ERR_SIG_NULLDUMMY'
              return false
            }
            this.stack.pop()

            this.stack.push(fSuccess ? Interp.true : Interp.false)

            if (opCodeNum === OpCode.OP_CHECKMULTISIGVERIFY) {
              if (fSuccess) {
                this.stack.pop()
              } else {
                this.errStr = 'SCRIPT_ERR_CHECKMULTISIGVERIFY'
                return false
              }
            }
          }
          break

        //
        // Byte string operations
        //
        case OpCode.OP_CAT:
          {
            if (this.stack.length < 2) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const vch1 = this.stack[this.stack.length - 2]
            const vch2 = this.stack[this.stack.length - 1]
            this.stack[this.stack.length - 2] = Buffer.concat([vch1, vch2])
            this.stack.pop()
          }
          break

        case OpCode.OP_SPLIT:
          {
            if (this.stack.length < 2) {
              this.errStr = 'SCRIPT_ERR_INVALID_STACK_OPERATION'
              return false
            }
            const data = this.stack[this.stack.length - 2]
            let position
            try {
              const pbuf = this.stack[this.stack.length - 1]
              const pbn = new Bn().fromScriptNumBuffer(pbuf, fRequireMinimal)
              position = pbn.toNumber()
            } catch (e) {
              this.errStr = e.message.includes('overflow') ? 'SCRIPTNUM_OVERFLOW' : 'SCRIPT_ERR_UNKNOWN_ERROR'
              return false
            }

            if (position < 0 || position > data.length) {
              this.errStr = 'SCRIPT_ERR_INVALID_SPLIT_RANGE'
              return false
            }
            const n1 = data.slice(0, position)
            const n2 = data.slice(position)
            this.stack.pop()
            this.stack.pop()
            this.stack.push(n1)
            this.stack.push(n2)
          }
          break

        case OpCode.OP_NUM2BIN:
          {
            if (this.stack.length < 2) {
              this.errStr = 'OP_NUM2BIN requires at least two items to be on the stack.'
              return false
            }
            let size
            try {
              const sbuf = this.stack[this.stack.length - 1]
              size = new Bn().fromScriptNumBuffer(
                sbuf,
                fRequireMinimal,
                this.scriptNumMaxSize()
              ).toNumber()
            } catch (e) {
              this.errStr = e.message.includes('overflow') ? 'SCRIPTNUM_OVERFLOW' : 'SCRIPT_ERR_UNKNOWN_ERROR'
              return false
            }

            if (size > this.maxScriptElementSize()) {
              this.errStr = `It's not currently possible to push data larger than ${Interp.MAX_SCRIPT_ELEMENT_SIZE} bytes.`
              return false
            }

            this.stack.pop()
            let rawnum = this.stack[this.stack.length - 1]
            rawnum = minimallyEncode(rawnum)

            if (rawnum.length > size) {
              this.errStr = 'OP_NUM2BIN requires that the size expressed in the top stack item is large enough to hold the value expressed in the second-from-top stack item.'
              return false
            }

            if (rawnum.length === size) {
              break
            }

            let signbit = 0x00
            if (rawnum.length > 0) {
              signbit = rawnum[rawnum.length - 1] & 0x80
              rawnum[rawnum.length - 1] &= 0x7f
            }

            const num = Buffer.alloc(size)
            rawnum.copy(num)
            if (size > 0) {
              num[size - 1] |= signbit
            }
            this.stack[this.stack.length - 1] = num
          }
          break

        case OpCode.OP_BIN2NUM:
          {
            if (this.stack.length < 1) {
              this.errStr = 'OP_BIN2NUM requires at least one item to be on the stack.'
              return false
            }
            const tmp1 = this.stack[this.stack.length - 1]
            const tmp2 = minimallyEncode(tmp1)
            try {
              this.stack[this.stack.length - 1] = new Bn().fromScriptNumBuffer(tmp2, fRequireMinimal, this.scriptNumMaxSize()).toScriptNumBuffer()
            } catch (e) {
              this.errStr = e.message.includes('overflow') ? 'SCRIPTNUM_OVERFLOW' : 'SCRIPT_ERR_UNKNOWN_ERROR'
              return false
            }
          }
          break

        default:
          this.errStr = 'SCRIPT_ERR_BAD_OPCODE'
          return false
      }
    }

    return true
  }

  fromJSON (json) {
    this.fromJSONNoTx(json)
    this.tx = json.tx ? new Tx().fromJSON(json.tx) : undefined
    return this
  }
  /**
   * Convert JSON containing everything but the tx to an interp object.
   */
  fromJSONNoTx (json) {
    this.fromObject({
      script:
        json.script !== undefined
          ? new Script().fromJSON(json.script)
          : undefined,
      nIn: json.nIn
    })
    this.stack = []
    json.stack.forEach(
      function (hex) {
        this.stack.push(Buffer.from(hex, 'hex'))
      }.bind(this)
    )
    this.altStack = []
    json.altStack.forEach(
      function (hex) {
        this.altStack.push(Buffer.from(hex, 'hex'))
      }.bind(this)
    )
    this.fromObject({
      pc: json.pc,
      pBeginCodeHash: json.pBeginCodeHash,
      nOpCount: json.nOpCount,
      ifStack: json.ifStack,
      errStr: json.errStr,
      flags: json.flags
    })
    return this
  }

  fromBr (br) {
    let jsonNoTxBufLEn = br.readVarIntNum()
    let jsonNoTxBuf = br.read(jsonNoTxBufLEn)
    this.fromJSONNoTx(JSON.parse(jsonNoTxBuf.toString()))
    let txbuflen = br.readVarIntNum()
    if (txbuflen > 0) {
      let txbuf = br.read(txbuflen)
      this.tx = new Tx().fromFastBuffer(txbuf)
    }
    return this
  }

  toJSON () {
    let json = this.toJSONNoTx()
    json.tx = this.tx ? this.tx.toJSON() : undefined
    return json
  }

  /**
   * Convert everything but the tx to JSON.
   */
  toJSONNoTx () {
    let stack = []
    this.stack.forEach(function (buf) {
      stack.push(buf.toString('hex'))
    })
    let altStack = []
    this.altStack.forEach(function (buf) {
      altStack.push(buf.toString('hex'))
    })
    return {
      script: this.script ? this.script.toJSON() : undefined,
      nIn: this.nIn,
      stack: stack,
      altStack: altStack,
      pc: this.pc,
      pBeginCodeHash: this.pBeginCodeHash,
      nOpCount: this.nOpCount,
      ifStack: this.ifStack,
      errStr: this.errStr,
      flags: this.flags,
      preImage: this?.preImage ? this.preImage.toString("hex"):"",
      hashBuf: this?.hashBuf ? this.hashBuf.toString("hex"):""
    }
  }

  toBw (bw) {
    if (!bw) {
      bw = new Bw()
    }
    let jsonNoTxBuf = Buffer.from(JSON.stringify(this.toJSONNoTx()))
    bw.writeVarIntNum(jsonNoTxBuf.length)
    bw.write(jsonNoTxBuf)
    if (this.tx) {
      let txbuf = this.tx.toFastBuffer()
      bw.writeVarIntNum(txbuf.length)
      bw.write(txbuf)
    } else {
      bw.writeVarIntNum(0)
    }
    return bw
  }

  static getFlags (flagstr) {
    let flags = 0
    if (flagstr.indexOf('NONE') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_NONE
    }
    if (flagstr.indexOf('P2SH') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_P2SH
    }
    if (flagstr.indexOf('STRICTENC') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_STRICTENC
    }
    if (flagstr.indexOf('DERSIG') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_DERSIG
    }
    if (flagstr.indexOf('LOW_S') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_LOW_S
    }
    if (flagstr.indexOf('NULLDUMMY') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_NULLDUMMY
    }
    if (flagstr.indexOf('SIGPUSHONLY') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_SIGPUSHONLY
    }
    if (flagstr.indexOf('MINIMALDATA') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_MINIMALDATA
    }
    if (flagstr.indexOf('DISCOURAGE_UPGRADABLE_NOPS') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS
    }
    if (flagstr.indexOf('CLEANSTACK') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_CLEANSTACK
    }
    if (flagstr.indexOf('CHECKLOCKTIMEVERIFY') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY
    }
    if (flagstr.indexOf('CHECKSEQUENCEVERIFY') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY
    }
    if (flagstr.indexOf('SIGHASH_FORKID') !== -1) {
      flags = flags | Interp.SCRIPT_ENABLE_SIGHASH_FORKID
    }
    if (flagstr.indexOf('CHRONICLE') !== -1) {
      flags = flags | Interp.SCRIPT_VERIFY_CHRONICLE
    }
    return flags
  }

  * eval () {
    if (this.isPreGenesis()) {
      for (const chunk of this.script.chunks) {
        if (preGenesisDisabledOpCodes.includes(chunk.opCodeNum)) {
          this.errStr = 'SCRIPT_ERR_DISABLED_OPCODE'
          yield false
        }
      }
    }

    if (this.script.toBuffer().length > this.scriptLimit) {
      this.errStr = 'SCRIPT_ERR_SCRIPT_SIZE'
      yield false
    }

    try {
      while (this.pc < this.script.chunks.length) {
        const fSuccess = yield * this.step()
        if (!fSuccess) {
          yield false
        } else {
          yield fSuccess
        }
      }

      // Size limits
      if (this.stack.length + this.altStack.length > this.stackLimit) {
        this.errStr = 'SCRIPT_ERR_STACK_SIZE'
        yield false
      }
    } catch (e) {
      this.errStr = 'SCRIPT_ERR_UNKNOWN_ERROR: ' + e
      yield false
    }

    if (this.ifStack.length > 0) {
      this.errStr = 'SCRIPT_ERR_UNBALANCED_CONDITIONAL'
      yield false
    }

    yield true
  }

  /**
   * Based on the inner loop of bitcoin core's EvalScript function
   */

  verify (scriptSig, scriptPubKey, tx, nIn, flags, valueBn) {
    const results = this.results(
      scriptSig,
      scriptPubKey,
      tx,
      nIn,
      flags,
      valueBn
    )
    for (const success of results) {
      if (!success) {
        return false
      }
    }
    return true
  }

  * results (scriptSig, scriptPubKey, tx, nIn, flags, valueBn) {
    let stackCopy

    this.fromObject({
      script: scriptSig,
      tx: tx,
      nIn: nIn,
      flags: flags,
      valueBn: valueBn
    })
    this.setLimits()
    this.isUnlockingScript = true
    this.lockingScript = scriptPubKey

    if (
      (flags & Interp.SCRIPT_VERIFY_SIGPUSHONLY) !== 0 &&
      !this.isChronicle() &&
      !scriptSig.isPushOnly()
    ) {
      this.errStr = this.errStr || 'SCRIPT_ERR_SIG_PUSHONLY'
      yield false
    }

    yield * this.eval()

    if (flags & Interp.SCRIPT_VERIFY_P2SH) {
      stackCopy = this.stack.slice()
    }

    const stack = this.stack
    this.initialize()
    this.fromObject({
      script: scriptPubKey,
      stack: stack,
      tx: tx,
      nIn: nIn,
      flags: flags,
      valueBn: valueBn
    })
    this.setLimits()
    this.isUnlockingScript = false

    yield * this.eval()

    if (this.stack.length === 0) {
      this.errStr = this.errStr || 'SCRIPT_ERR_EVAL_FALSE'
      yield false
    }

    const buf = this.stack[this.stack.length - 1]
    if (!Interp.castToBool(buf)) {
      this.errStr = this.errStr || 'SCRIPT_ERR_EVAL_FALSE'
      yield false
    }

    if (flags & Interp.SCRIPT_VERIFY_P2SH && scriptPubKey.isScriptHashOut()) {
      if (!scriptSig.isPushOnly()) {
        this.errStr = this.errStr || 'SCRIPT_ERR_SIG_PUSHONLY'
        yield false
      }

      const tmp = this.stack
      this.stack = stackCopy
      stackCopy = tmp

      if (this.stack.length === 0) {
        throw new Error('internal error - stack copy empty')
      }

      const pubKeySerialized = this.stack[this.stack.length - 1]
      const scriptPubKey2 = new Script().fromBuffer(pubKeySerialized)
      this.stack.pop()

      const stack2 = this.stack
      this.initialize()
      this.fromObject({
        script: scriptPubKey2,
        stack: stack2,
        tx: tx,
        nIn: nIn,
        flags: flags,
        valueBn: valueBn
      })
      this.setLimits()

      yield * this.eval()

      if (this.stack.length === 0) {
        this.errStr = this.errStr || 'SCRIPT_ERR_EVAL_FALSE'
        yield false
      }

      if (!Interp.castToBool(this.stack[this.stack.length - 1])) {
        this.errStr = this.errStr || 'SCRIPT_ERR_EVAL_FALSE'
        yield false
      } else {
        yield true
      }
    }

    if (
      (flags & Interp.SCRIPT_VERIFY_CLEANSTACK) !== 0 &&
      !this.isChronicle()
    ) {
      if (!(flags & Interp.SCRIPT_VERIFY_P2SH)) {
        throw new Error('cannot use CLEANSTACK without P2SH')
      }
      if (this.stack.length !== 1) {
        this.errStr = this.errStr || 'SCRIPT_ERR_CLEANSTACK'
        yield false
      }
    }

    yield true
  }

  getDebugObject () {
    const pc = this.pc - 1
    return {
      errStr: this.errStr,
      scriptStr: this.script ? this.script.toString() : 'no script found',
      pc: pc,
      stack: this.stack.map(buf => buf.toString('hex')),
      altStack: this.altStack.map(buf => buf.toString('hex')),
      opCodeStr: this.script && this.script.chunks && this.script.chunks[pc]
        ? OpCode.fromNumber(this.script.chunks[pc].opCodeNum).toString()
        : 'no script or chunk found'
    }
  }

  getDebugString () {
    return JSON.stringify(this.getDebugObject(), null, 2)
  }
}

Interp.true = Buffer.from([1])
Interp.false = Buffer.from([])
Interp.MAX_SCRIPT_ELEMENT_SIZE = 500 * 1000
Interp.DEFAULT_SCRIPT_NUM_LENGTH_POLICY_AFTER_GENESIS = 10 * 1000
Interp.LOCKTIME_THRESHOLD = 500000000
Interp.SCRIPT_VERIFY_NONE = 0
Interp.SCRIPT_VERIFY_P2SH = 1 << 0
Interp.SCRIPT_VERIFY_STRICTENC = 1 << 1
Interp.SCRIPT_VERIFY_DERSIG = 1 << 2
Interp.SCRIPT_VERIFY_LOW_S = 1 << 3
Interp.SCRIPT_VERIFY_NULLDUMMY = 1 << 4
Interp.SCRIPT_VERIFY_SIGPUSHONLY = 1 << 5
Interp.SCRIPT_VERIFY_MINIMALDATA = 1 << 6
Interp.SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS = 1 << 7
Interp.SCRIPT_VERIFY_CLEANSTACK = 1 << 8
Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY = 1 << 9
Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY = 1 << 10
Interp.SCRIPT_ENABLE_SIGHASH_FORKID = 1 << 16
// Pre-Genesis policy: 4-byte script numbers, 520-byte pushes, 10KB scripts,
// 1000 stack elements and disabled string/bit arithmetic opcodes.
Interp.SCRIPT_VERIFY_PREGENESIS_LIMITS = 1 << 17
Interp.PREGENESIS_SCRIPT_NUM_LENGTH = 4
Interp.PREGENESIS_MAX_SCRIPT_ELEMENT_SIZE = 520
Interp.PREGENESIS_SCRIPT_LIMIT = 10000
Interp.PREGENESIS_STACK_LIMIT = 1000
// Chronicle release: consensus limit raised to 32MB for script numbers.
Interp.SCRIPT_VERIFY_CHRONICLE = 1 << 18
Interp.DEFAULT_SCRIPT_NUM_LENGTH_POLICY_AFTER_CHRONICLE = 32 * 1024 * 1024

Interp.defaultFlags =
  Interp.SCRIPT_VERIFY_P2SH |
  Interp.SCRIPT_VERIFY_STRICTENC |
  Interp.SCRIPT_ENABLE_SIGHASH_FORKID |
  Interp.SCRIPT_VERIFY_LOW_S |
  Interp.SCRIPT_VERIFY_NULLDUMMY |
  Interp.SCRIPT_VERIFY_DERSIG |
  Interp.SCRIPT_VERIFY_MINIMALDATA |
  Interp.SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS |
  Interp.SCRIPT_VERIFY_CLEANSTACK |
  Interp.SCRIPT_VERIFY_SIGPUSHONLY |
  Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY |
  Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY

export { Interp }
