/* global describe,it */
'use strict'
import should from 'should'
import { Interp } from '../lib/interp'
import { Tx } from '../lib/tx'
import { Script } from '../lib/script'
import { Bn } from '../lib/bn'
import { KeyPair } from '../lib/key-pair'
import { Sig } from '../lib/sig'
import bitcoindScriptValid from './vectors/bitcoind/script_valid.json'
import bitcoindScriptInvalid from './vectors/bitcoind/script_invalid.json'
import bitcoinABCScriptTests from './vectors/bitcoin-abc/script_tests.json'
import bitcoinSVScriptTests from './vectors/bitcoin-sv/script_tests.json'

/**
 * Vectors written for pre-Genesis Bitcoin policy. They are run with
 * SCRIPT_VERIFY_PREGENESIS_LIMITS, which restores the 4-byte script number
 * limit, the 520-byte push limit, the 10KB script / 1000 stack limits and the
 * disabled opcodes from before BSV Genesis.
 */
const legacyPolicyInvalid = new Set([
  99, 100, 110, 111, 112, 113, 207, 208, 211, 212, 213,
  222, 223, 224, 225, 226, 227, 228
])
const legacyPolicySV = new Set([130, 132, 160, 162])

describe('Interp', function () {
  it('should make a new interp', function () {
    let interp = new Interp()
    ;(interp instanceof Interp).should.equal(true)
    interp.stack.length.should.equal(0)
    interp.altStack.length.should.equal(0)
    interp.pc.should.equal(0)
    interp.pBeginCodeHash.should.equal(0)
    interp.nOpCount.should.equal(0)
    interp.ifStack.length.should.equal(0)
    interp.errStr.should.equal('')
    interp.flags.should.equal(Interp.defaultFlags)
    interp = new Interp()
    ;(interp instanceof Interp).should.equal(true)
    interp.stack.length.should.equal(0)
    interp.altStack.length.should.equal(0)
    interp.pc.should.equal(0)
    interp.pBeginCodeHash.should.equal(0)
    interp.nOpCount.should.equal(0)
    interp.ifStack.length.should.equal(0)
    interp.errStr.should.equal('')
    interp.flags.should.equal(Interp.defaultFlags)
  })

  describe('#fromJSON', function () {
    it('should convert a json to an interp', function () {
      const interp = new Interp().fromObject({
        script: new Script(),
        stack: ['00'],
        altStack: ['00']
      })
      const json = interp.toJSON()
      const interp2 = new Interp().fromJSON(json)
      should.exist(interp2.script)
      should.exist(interp2.stack[0])
      should.exist(interp2.altStack[0])
    })
  })

  describe('#fromFastBuffer', function () {
    it('should convert an interp buf to an interp', function () {
      const interp = new Interp().fromObject({
        script: new Script(),
        stack: ['00'],
        altStack: ['00']
      })
      const buf = interp.toFastBuffer()
      const interp2 = new Interp().fromFastBuffer(buf)
      should.exist(interp2.script)
      should.exist(interp2.stack[0])
      should.exist(interp2.altStack[0])
    })

    it('should convert an interp buf to an interp', function () {
      const interp = new Interp().fromObject({
        script: new Script(),
        stack: ['00'],
        altStack: ['00'],
        tx: new Tx()
      })
      const buf = interp.toFastBuffer()
      const interp2 = new Interp().fromFastBuffer(buf)
      should.exist(interp2.script)
      should.exist(interp2.stack[0])
      should.exist(interp2.altStack[0])
    })
  })

  describe('#toJSON', function () {
    it('should convert an interp to json', function () {
      const interp = new Interp().fromObject({ script: new Script() })
      const json = interp.toJSON()
      should.exist(json.script)
      should.not.exist(json.tx)
    })
  })

  describe('#toFastBuffer', function () {
    it('should convert an interp to buf with no tx', function () {
      const interp = new Interp().fromObject({ script: new Script() })
      Buffer.isBuffer(interp.toFastBuffer()).should.equal(true)
    })

    it('should convert an interp to buf with a tx', function () {
      const interp = new Interp().fromObject({
        script: new Script(),
        tx: new Tx()
      })
      Buffer.isBuffer(interp.toFastBuffer()).should.equal(true)
    })
  })

  describe('@castToBool', function () {
    it('should cast these bufs to bool correctly', function () {
      Interp.castToBool(new Bn(0).toSm({ endian: 'little' })).should.equal(
        false
      )
      Interp.castToBool(Buffer.from('0080', 'hex')).should.equal(false) // negative 0
      Interp.castToBool(new Bn(1).toSm({ endian: 'little' })).should.equal(true)
      Interp.castToBool(new Bn(-1).toSm({ endian: 'little' })).should.equal(
        true
      )

      const buf = Buffer.from('00', 'hex')
      const bool = new Bn().fromSm(buf, { endian: 'little' }).cmp(0) !== 0
      Interp.castToBool(buf).should.equal(bool)
    })
  })

  describe('#getDebugObject', function () {
    it('should get a failure explanation object', function () {
      const scriptSig = Script.fromBitcoindString(
        '0x47 0x3044022057292e2d4dfe775becdd0a9e6547997c728cdf35390f6a017da56d654d374e4902206b643be2fc53763b4e284845bfea2c597d2dc7759941dce937636c9d341b71ed01'
      )
      const scriptPubKey = Script.fromBitcoindString(
        '0x41 0x0679be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8 CHECKSIG'
      )
      const flags =
        Interp.SCRIPT_VERIFY_P2SH |
        Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY |
        Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY

      const hashBuf = Buffer.alloc(32)
      hashBuf.fill(0)
      const credtx = new Tx()
      credtx.addTxIn(
        hashBuf,
        0xffffffff,
        new Script().writeString('OP_0 OP_0'),
        0xffffffff
      )
      credtx.addTxOut(new Bn(0), scriptPubKey)

      const idbuf = credtx.hash()
      const spendtx = new Tx()
      spendtx.addTxIn(idbuf, 0, new Script(), 0xffffffff)
      spendtx.addTxOut(new Bn(0), new Script())

      const interp = new Interp()
      interp.verify(scriptSig, scriptPubKey, spendtx, 0, flags)
      const debugObject = interp.getDebugObject()
      should.exist(debugObject.errStr)
      should.exist(debugObject.scriptStr)
      should.exist(debugObject.pc)
      should.exist(debugObject.opCodeStr)
    })
  })

  describe('#getDebugString', function () {
    it('should get a failure explanation object', function () {
      const scriptSig = Script.fromBitcoindString(
        '0x47 0x3044022057292e2d4dfe775becdd0a9e6547997c728cdf35390f6a017da56d654d374e4902206b643be2fc53763b4e284845bfea2c597d2dc7759941dce937636c9d341b71ed01'
      )
      const scriptPubKey = Script.fromBitcoindString(
        '0x41 0x0679be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8 CHECKSIG'
      )
      const flags =
        Interp.SCRIPT_VERIFY_P2SH |
        Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY |
        Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY

      const hashBuf = Buffer.alloc(32)
      hashBuf.fill(0)
      const credtx = new Tx()
      credtx.addTxIn(
        hashBuf,
        0xffffffff,
        new Script().writeString('OP_0 OP_0'),
        0xffffffff
      )
      credtx.addTxOut(new Bn(0), scriptPubKey)

      const idbuf = credtx.hash()
      const spendtx = new Tx()
      spendtx.addTxIn(idbuf, 0, new Script(), 0xffffffff)
      spendtx.addTxOut(new Bn(0), new Script())

      const interp = new Interp()
      interp.verify(scriptSig, scriptPubKey, spendtx, 0, flags)
      const debugString = interp.getDebugString()
      debugString.should.equal(
        '{\n  "errStr": "",\n  "scriptStr": "65 0x0679be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8 OP_CHECKSIG",\n  "pc": 1,\n  "stack": [\n    "01"\n  ],\n  "altStack": [],\n  "opCodeStr": "OP_CHECKSIG"\n}'
      )
    })
  })

  describe('#verify', function () {
    it('should has correct stack size after verify', function () {
      const interp = new Interp()
      const script = Script.fromAsmString('OP_1')
      interp.script = script
      interp.verify()
      should.equal(interp.stack.length, 1)
    })

    it('should verify or unverify these trivial scripts from script_valid.json', function () {
      let verified
      verified = new Interp().verify(
        new Script().writeString('OP_1'),
        new Script().writeString('OP_1'),
        new Tx(),
        0
      )
      verified.should.equal(true)
      verified = new Interp().verify(
        new Script().writeString('OP_1'),
        new Script().writeString('OP_0'),
        new Tx(),
        0
      )
      verified.should.equal(false)
      verified = new Interp().verify(
        new Script().writeString('OP_0'),
        new Script().writeString('OP_1'),
        new Tx(),
        0
      )
      verified.should.equal(true)
      verified = new Interp().verify(
        new Script().writeString('OP_CODESEPARATOR'),
        new Script().writeString('OP_1'),
        new Tx(),
        0
      )
      verified.should.equal(true)
      verified = new Interp().verify(
        new Script().writeString(''),
        new Script().writeString('OP_DEPTH OP_0 OP_EQUAL'),
        new Tx(),
        0
      )
      verified.should.equal(true)
      verified = new Interp().verify(
        new Script().writeString('OP_1 OP_2'),
        new Script().writeString('OP_2 OP_EQUALVERIFY OP_1 OP_EQUAL'),
        new Tx(),
        0
      )
      verified.should.equal(true)
      verified = new Interp().verify(
        new Script().writeString('9 0x000000000000000010'),
        new Script().writeString(''),
        new Tx(),
        0
      )
      verified.should.equal(true)
      verified = new Interp().verify(
        new Script().writeString('OP_1'),
        new Script().writeString('OP_15 OP_ADD OP_16 OP_EQUAL'),
        new Tx(),
        0
      )
      verified.should.equal(true)
      verified = new Interp().verify(
        new Script().writeString('OP_0'),
        new Script().writeString('OP_IF OP_VER OP_ELSE OP_1 OP_ENDIF'),
        new Tx(),
        0
      )
      verified.should.equal(true)
    })

    it('should verify this new pay-to-pubKey script', function () {
      const keyPair = new KeyPair().fromRandom()
      const scriptPubKey = new Script()
        .writeBuffer(keyPair.pubKey.toDer(true))
        .writeString('OP_CHECKSIG')

      const hashBuf = Buffer.alloc(32)
      hashBuf.fill(0)
      const credtx = new Tx()
      credtx.addTxIn(
        hashBuf,
        0xffffffff,
        new Script().writeString('OP_0 OP_0'),
        0xffffffff
      )
      credtx.addTxOut(new Bn(0), scriptPubKey)

      const idbuf = credtx.hash()
      const spendtx = new Tx()
      spendtx.addTxIn(idbuf, 0, new Script(), 0xffffffff)
      spendtx.addTxOut(new Bn(0), new Script())

      const sig = spendtx.sign(keyPair, Sig.SIGHASH_ALL, 0, scriptPubKey)
      const scriptSig = new Script().writeBuffer(sig.toTxFormat())
      spendtx.txIns[0].setScript(scriptSig)

      const interp = new Interp()
      const verified = interp.verify(scriptSig, scriptPubKey, spendtx, 0)
      verified.should.equal(true)
    })

    it('should verify this pay-to-pubKey script from script_valid.json', function () {
      const scriptSig = new Script().fromBitcoindString(
        '0x47 0x3044022007415aa37ce7eaa6146001ac8bdefca0ddcba0e37c5dc08c4ac99392124ebac802207d382307fd53f65778b07b9c63b6e196edeadf0be719130c5db21ff1e700d67501'
      )
      const scriptPubKey = new Script().fromBitcoindString(
        '0x41 0x0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8 CHECKSIG'
      )

      const hashBuf = Buffer.alloc(32)
      hashBuf.fill(0)
      const credtx = new Tx()
      credtx.addTxIn(
        hashBuf,
        0xffffffff,
        new Script().writeString('OP_0 OP_0'),
        0xffffffff
      )
      credtx.addTxOut(new Bn(0), scriptPubKey)

      const idbuf = credtx.hash()
      const spendtx = new Tx()
      spendtx.addTxIn(idbuf, 0, scriptSig, 0xffffffff)
      spendtx.addTxOut(new Bn(0), new Script())

      const interp = new Interp()
      const verified = interp.verify(scriptSig, scriptPubKey, spendtx, 0, 0)
      verified.should.equal(true)
    })
  })

  describe('Interp vectors', function () {
    let c

    c = 0
    bitcoinABCScriptTests.forEach(function (vector, i) {
      if (vector.length === 1) {
        return
      }
      c++
      it('should verify bitcoindScriptValid vector ' + c, function () {
        // ["Format is: [scriptSig, scriptPubKey, flags, expected_scripterror, ... comments]"],
        // Test vectors for SIGHASH_FORKID
        const scriptSig = new Script().fromBitcoindString(vector[0])
        const scriptPubKey = new Script().fromBitcoindString(vector[1])
        const flags = Interp.getFlags(vector[2])
        const expectedError = vector[3]

        const hashBuf = Buffer.alloc(32)
        hashBuf.fill(0)
        const credtx = new Tx()
        credtx.addTxIn(
          hashBuf,
          0xffffffff,
          new Script().writeString('OP_0 OP_0'),
          0xffffffff
        )
        credtx.addTxOut(new Bn(0), scriptPubKey)

        const idbuf = credtx.hash()
        const spendtx = new Tx()
        spendtx.addTxIn(idbuf, 0, scriptSig, 0xffffffff)
        spendtx.addTxOut(new Bn(0), new Script())

        const interp = new Interp()
        const valueBn = new Bn(0)
        const verified = interp.verify(
          scriptSig,
          scriptPubKey,
          spendtx,
          0,
          flags,
          valueBn
        )
        try {
          if (expectedError === 'OK') {
            verified.should.equal(true)
          } else {
            verified.should.equal(false)
          }
        } catch (err) {
          console.log(vector)
          throw new Error('failure', err)
        }
      })
    })

    c = 0
    bitcoinSVScriptTests.forEach(function (vector, i) {
      if (vector.length === 1) {
        return
      }
      c++
      const vectorNum = c
      it('should verify bitcoinSVScriptTests vector ' + vectorNum +
         (legacyPolicySV.has(vectorNum) ? ' (pre-genesis limits)' : ''), function () {
        // ["Format is: [scriptSig, scriptPubKey, flags, expected_scripterror, ... comments]"],
        const scriptSig = new Script().fromBitcoindString(vector[0])
        const scriptPubKey = new Script().fromBitcoindString(vector[1])
        const flags = Interp.getFlags(vector[2]) |
          (legacyPolicySV.has(vectorNum) ? Interp.SCRIPT_VERIFY_PREGENESIS_LIMITS : 0)
        const expectedError = vector[3]

        const hashBuf = Buffer.alloc(32)
        hashBuf.fill(0)
        const credtx = new Tx()
        credtx.addTxIn(
          hashBuf,
          0xffffffff,
          new Script().writeString('OP_0 OP_0'),
          0xffffffff
        )
        credtx.addTxOut(new Bn(0), scriptPubKey)

        const idbuf = credtx.hash()
        const spendtx = new Tx()
        spendtx.addTxIn(idbuf, 0, scriptSig, 0xffffffff)
        spendtx.addTxOut(new Bn(0), new Script())

        const interp = new Interp()
        const valueBn = new Bn(0)
        const verified = interp.verify(
          scriptSig,
          scriptPubKey,
          spendtx,
          0,
          flags,
          valueBn
        )
        try {
          if (expectedError === 'OK') {
            verified.should.equal(true)
          } else {
            verified.should.equal(false)
          }
        } catch (err) {
          console.log(vector)
          throw new Error('failure', err)
        }
      })
    })

    c = 0
    bitcoindScriptValid.forEach(function (vector, i) {
      if (vector.length === 1) {
        return
      }
      c++
      it('should verify bitcoindScriptValid vector ' + c, function () {
        const scriptSig = new Script().fromBitcoindString(vector[0])
        const scriptPubKey = new Script().fromBitcoindString(vector[1])
        const flags = Interp.getFlags(vector[2])

        const hashBuf = Buffer.alloc(32)
        hashBuf.fill(0)
        const credtx = new Tx()
        credtx.addTxIn(
          hashBuf,
          0xffffffff,
          new Script().writeString('OP_0 OP_0'),
          0xffffffff
        )
        credtx.addTxOut(new Bn(0), scriptPubKey)

        const idbuf = credtx.hash()
        const spendtx = new Tx()
        spendtx.addTxIn(idbuf, 0, scriptSig, 0xffffffff)
        spendtx.addTxOut(new Bn(0), new Script())

        const interp = new Interp()
        const verified = interp.verify(scriptSig, scriptPubKey, spendtx, 0, flags)
        verified.should.equal(true)
      })
    })

    c = 0
    bitcoindScriptInvalid.forEach(function (vector, i) {
      if (vector.length === 1) {
        return
      }
      c++
      const vectorNum = c
      it('should unverify bitcoindScriptInvalid vector ' + vectorNum +
         (legacyPolicyInvalid.has(vectorNum) ? ' (pre-genesis limits)' : ''), function () {
        const scriptSig = new Script().fromBitcoindString(vector[0])
        const scriptPubKey = new Script().fromBitcoindString(vector[1])
        const flags = Interp.getFlags(vector[2]) |
          (legacyPolicyInvalid.has(vectorNum) ? Interp.SCRIPT_VERIFY_PREGENESIS_LIMITS : 0)

        const hashBuf = Buffer.alloc(32)
        hashBuf.fill(0)
        const credtx = new Tx()
        credtx.addTxIn(
          hashBuf,
          0xffffffff,
          new Script().writeString('OP_0 OP_0'),
          0xffffffff
        )
        credtx.addTxOut(new Bn(0), scriptPubKey)

        const idbuf = credtx.hash()
        const spendtx = new Tx()
        spendtx.addTxIn(idbuf, 0, scriptSig, 0xffffffff)
        spendtx.addTxOut(new Bn(0), new Script())

        const interp = new Interp()
        const verified = interp.verify(scriptSig, scriptPubKey, spendtx, 0, flags)
        verified.should.equal(false)
      })
    })

  describe('pre-genesis limits flag', function () {
    const PRE = Interp.SCRIPT_VERIFY_PREGENESIS_LIMITS
    const baseFlags = Interp.SCRIPT_VERIFY_P2SH | Interp.SCRIPT_VERIFY_STRICTENC

    const verifyScripts = function (scriptSig, scriptPubKey, flags) {
      const credtx = new Tx()
      credtx.addTxIn(
        Buffer.alloc(32),
        0xffffffff,
        new Script().writeString('OP_0 OP_0'),
        0xffffffff
      )
      credtx.addTxOut(new Bn(0), scriptPubKey)
      const spendtx = new Tx()
      spendtx.addTxIn(credtx.hash(), 0, scriptSig, 0xffffffff)
      spendtx.addTxOut(new Bn(0), new Script())
      return new Interp().verify(
        scriptSig,
        scriptPubKey,
        spendtx,
        0,
        flags,
        new Bn(0)
      )
    }

    const verifyStrings = function (scriptSig, scriptPubKey, flags) {
      return verifyScripts(
        new Script().fromBitcoindString(scriptSig),
        new Script().fromBitcoindString(scriptPubKey),
        flags
      )
    }

    it('should not be part of the default flags', function () {
      ;(PRE & Interp.defaultFlags).should.equal(0)
      Interp.PREGENESIS_SCRIPT_NUM_LENGTH.should.equal(4)
      Interp.PREGENESIS_MAX_SCRIPT_ELEMENT_SIZE.should.equal(520)
    })

    it('should switch the helper limits on and off', function () {
      const interp = new Interp()
      interp.flags = Interp.defaultFlags
      interp.scriptNumMaxSize().should.equal(
        Interp.DEFAULT_SCRIPT_NUM_LENGTH_POLICY_AFTER_GENESIS
      )
      interp.maxScriptElementSize().should.equal(Interp.MAX_SCRIPT_ELEMENT_SIZE)
      interp.setLimits().scriptLimit.should.equal(10000000)
      interp.stackLimit.should.equal(10000000)

      interp.flags = baseFlags | PRE
      interp.isPreGenesis().should.equal(true)
      interp.scriptNumMaxSize().should.equal(4)
      interp.maxScriptElementSize().should.equal(520)
      interp.setLimits().scriptLimit.should.equal(10000)
      interp.stackLimit.should.equal(1000)
    })

    it('should reject 5-byte script numbers only with the flag', function () {
      verifyStrings('2147483648 0 ADD', 'NOP', baseFlags).should.equal(true)
      verifyStrings('2147483648 0 ADD', 'NOP', baseFlags | PRE).should.equal(
        false
      )
    })

    it('should reject pushes larger than 520 bytes only with the flag', function () {
      const big = "'" + 'b'.repeat(521) + "'"
      verifyStrings('NOP', big, baseFlags).should.equal(true)
      verifyStrings('NOP', big, baseFlags | PRE).should.equal(false)
    })

    it('should reject scripts larger than 10KB only with the flag', function () {
      const bigScript = new Script().writeBuffer(Buffer.alloc(10001, 0x51))
      verifyScripts(new Script(), bigScript, baseFlags).should.equal(true)
      verifyScripts(new Script(), bigScript, baseFlags | PRE).should.equal(
        false
      )
    })

    it('should reject stacks larger than 1000 only with the flag', function () {
      const bigStack = new Script().fromBuffer(Buffer.alloc(1001, 0x51))
      verifyScripts(bigStack, new Script().fromBuffer(Buffer.from([0x61])), baseFlags).should.equal(true)
      verifyScripts(
        bigStack,
        new Script().fromBuffer(Buffer.from([0x61])),
        baseFlags | PRE
      ).should.equal(false)
    })

    it('should reject disabled opcodes in unexecuted branches only with the flag', function () {
      verifyStrings(
        "'abc' 2 0",
        'IF LEFT ELSE 1 ENDIF',
        baseFlags
      ).should.equal(true)
      verifyStrings(
        "'abc' 2 0",
        'IF LEFT ELSE 1 ENDIF',
        baseFlags | PRE
      ).should.equal(false)
      verifyStrings(
        "'abc' 2 0",
        'IF RIGHT ELSE 1 ENDIF',
        baseFlags | PRE
      ).should.equal(false)
    })
  })

  describe('Chronicle flag', function () {
    const CHRONICLE = Interp.SCRIPT_VERIFY_CHRONICLE

    it('should not be part of the default flags', function () {
      ;(CHRONICLE & Interp.defaultFlags).should.equal(0)
      Interp.DEFAULT_SCRIPT_NUM_LENGTH_POLICY_AFTER_CHRONICLE.should.equal(32 * 1024 * 1024)
    })

    it('should be detected from the flag or a transaction version above 1', function () {
      new Interp().fromObject({ flags: CHRONICLE }).isChronicle().should.equal(true)
      new Interp().fromObject({ flags: 0, tx: new Tx() }).isChronicle().should.equal(false)
      new Interp()
        .fromObject({ flags: 0, tx: new Tx().fromObject({ versionBytesNum: 2 }) })
        .isChronicle()
        .should.equal(true)
    })

    it('should raise the script number limit', function () {
      new Interp().fromObject({ flags: 0, tx: new Tx() }).scriptNumMaxSize().should.equal(
        Interp.DEFAULT_SCRIPT_NUM_LENGTH_POLICY_AFTER_GENESIS
      )
      new Interp().fromObject({ flags: CHRONICLE }).scriptNumMaxSize().should.equal(
        Interp.DEFAULT_SCRIPT_NUM_LENGTH_POLICY_AFTER_CHRONICLE
      )
    })

    it('should give pre-genesis limits precedence over Chronicle', function () {
      new Interp()
        .fromObject({ flags: CHRONICLE | Interp.SCRIPT_VERIFY_PREGENESIS_LIMITS })
        .scriptNumMaxSize()
        .should.equal(4)
    })

    it('should parse CHRONICLE from a flag string', function () {
      Interp.getFlags('P2SH,CHRONICLE').should.equal(
        Interp.SCRIPT_VERIFY_P2SH | CHRONICLE
      )
    })
  })

  describe('Chronicle opcodes and policy', function () {
    const CHRONICLE = Interp.SCRIPT_VERIFY_CHRONICLE
    const flags = Interp.defaultFlags | CHRONICLE

    const run = function (sigBytes, pubBytes, verificationFlags) {
      return new Interp().verify(
        new Script().fromBuffer(Buffer.from(sigBytes)),
        new Script().fromBuffer(Buffer.from(pubBytes)),
        new Tx(),
        0,
        verificationFlags,
        new Bn(0)
      )
    }

    const push = function (str) {
      return Buffer.concat([Buffer.from([str.length]), Buffer.from(str)])
    }

    it('should push the transaction version with OP_VER', function () {
      // OP_VER OP_1 OP_NUMEQUAL (version 1, non-minimal encoding allowed)
      run([], [0x62, 0x51, 0x9c], flags).should.equal(true)
    })

    it('should evaluate OP_VERIF', function () {
      run([4, 1, 0, 0, 0], [0x65, 0x51, 0x67, 0x00, 0x68], flags).should.equal(true)
      run([4, 2, 0, 0, 0], [0x65, 0x51, 0x67, 0x00, 0x68], flags).should.equal(false)
    })

    it('should evaluate OP_VERNOTIF', function () {
      run([4, 2, 0, 0, 0], [0x66, 0x51, 0x67, 0x00, 0x68], flags).should.equal(true)
    })

    it('should reject VERIF/VERNOTIF outside Chronicle', function () {
      run([4, 1, 0, 0, 0], [0x65, 0x51, 0x67, 0x00, 0x68], Interp.defaultFlags).should.equal(false)
    })

    it('should evaluate OP_SUBSTR', function () {
      const pub = Buffer.concat([
        push('HelloWorld'),
        Buffer.from([0x54, 0x55, 0xb3]), // OP_4 OP_5 OP_SUBSTR_CHRONICLE
        push('oWorl'),
        Buffer.from([0x87]) // OP_EQUAL
      ])
      run([], pub, flags).should.equal(true)
    })

    it('should evaluate OP_LEFT', function () {
      const pub = Buffer.concat([
        push('HelloWorld'),
        Buffer.from([0x55, 0xb4]),
        push('Hello'),
        Buffer.from([0x87])
      ])
      run([], pub, flags).should.equal(true)
    })

    it('should evaluate OP_RIGHT', function () {
      const pub = Buffer.concat([
        push('HelloWorld'),
        Buffer.from([0x55, 0xb5]),
        push('World'),
        Buffer.from([0x87])
      ])
      run([], pub, flags).should.equal(true)
    })

    it('should reject out-of-range string operations', function () {
      const pub = Buffer.concat([push('abc'), Buffer.from([0x56, 0xb4])]) // len 6 > size
      run([], pub, flags).should.equal(false)
    })

    it('should evaluate OP_2MUL and OP_2DIV', function () {
      run([], [0x51, 0x8d, 0x52, 0x9c], flags).should.equal(true)
      run([], [0x52, 0x8e, 0x51, 0x9c], flags).should.equal(true)
    })

    it('should evaluate OP_LSHIFTNUM and OP_RSHIFTNUM', function () {
      run([], [0x51, 0x52, 0xb6, 0x54, 0x9c], flags).should.equal(true)
      run([], [0x60, 0x52, 0xb7, 0x54, 0x9c], flags).should.equal(true)
    })

    it('should clear conditionals when OP_RETURN ends the unlocking script', function () {
      // OP_1 OP_IF OP_RETURN OP_ENDIF OP_2 in the unlocking script;
      // OP_1 OP_NUMEQUAL in the locking script.
      run([0x51, 0x51, 0x63, 0x6a, 0x68, 0x52], [0x51, 0x9c], flags).should.equal(true)
    })

    it('should preserve sign in numeric shifts', function () {
      // -1 << 1 == -2
      run([], [0x4f, 0x51, 0xb6, 0x52, 0x8f, 0x9c], flags).should.equal(true)
      // -1 >> 1 == -1
      run([], [0x4f, 0x51, 0xb7, 0x4f, 0x9c], flags).should.equal(true)
      // -3 >> 1 == -2 (rounds toward negative infinity)
      run(
        [],
        [0x53, 0x8f, 0x51, 0xb7, 0x52, 0x8f, 0x9c],
        flags
      ).should.equal(true)
    })

    it('should accept high-S signatures under Chronicle only', function () {
      const keyPair = new KeyPair().fromRandom()
      const scriptPubKey = new Script()
        .writeBuffer(keyPair.pubKey.toDer(true))
        .writeString('OP_CHECKSIG')
      const valueBn = new Bn(1000)
      const funding = new Tx()
        .addTxIn(Buffer.alloc(32), 0xffffffff, new Script(), 0xffffffff)
        .addTxOut(valueBn, scriptPubKey)
      const spend = new Tx()
        .addTxIn(funding.hash(), 0, new Script(), 0xffffffff)
        .addTxOut(new Bn(900), scriptPubKey)
      const nHashType =
        Sig.SIGHASH_ALL | Sig.SIGHASH_FORKID | Sig.SIGHASH_CHRONICLE
      const sig = spend.sign(keyPair, nHashType, 0, scriptPubKey, valueBn)
      const order = Bn.fromBuffer(
        Buffer.from(
          'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
          'hex'
        )
      )
      const highS = new Sig().fromObject({
        r: sig.r,
        s: order.sub(sig.s),
        nHashType
      })
      highS.hasLowS().should.equal(false)
      const scriptSig = new Script().writeBuffer(highS.toTxFormat())
      spend.txIns[0].setScript(scriptSig)
      new Interp()
        .verify(
          scriptSig,
          scriptPubKey,
          spend,
          0,
          Interp.SCRIPT_ENABLE_SIGHASH_FORKID |
            Interp.SCRIPT_VERIFY_LOW_S,
          valueBn
        )
        .should.equal(false)
      new Interp()
        .verify(
          scriptSig,
          scriptPubKey,
          spend,
          0,
          Interp.SCRIPT_ENABLE_SIGHASH_FORKID | CHRONICLE,
          valueBn
        )
        .should.equal(true)
    })

    it('should accept a non-empty CHECKMULTISIG dummy under Chronicle only', function () {
      const keyPair = new KeyPair().fromRandom()
      const scriptPubKey = new Script()
        .writeString('OP_1')
        .writeBuffer(keyPair.pubKey.toDer(true))
        .writeString('OP_1 OP_CHECKMULTISIG')
      const valueBn = new Bn(1000)
      const funding = new Tx()
        .addTxIn(Buffer.alloc(32), 0xffffffff, new Script(), 0xffffffff)
        .addTxOut(valueBn, scriptPubKey)
      const spend = new Tx()
        .addTxIn(funding.hash(), 0, new Script(), 0xffffffff)
        .addTxOut(new Bn(900), scriptPubKey)
      const nHashType =
        Sig.SIGHASH_ALL | Sig.SIGHASH_FORKID | Sig.SIGHASH_CHRONICLE
      const sig = spend.sign(keyPair, nHashType, 0, scriptPubKey, valueBn)
      const scriptSig = new Script().writeString('OP_1').writeBuffer(sig.toTxFormat())
      spend.txIns[0].setScript(scriptSig)
      const baseFlags =
        Interp.SCRIPT_ENABLE_SIGHASH_FORKID | Interp.SCRIPT_VERIFY_NULLDUMMY
      new Interp().verify(scriptSig, scriptPubKey, spend, 0, baseFlags, valueBn).should.equal(false)
      new Interp()
        .verify(scriptSig, scriptPubKey, spend, 0, baseFlags | CHRONICLE, valueBn)
        .should.equal(true)
    })

    it('should activate Chronicle from a transaction version above 1', function () {
      const tx = new Tx().fromObject({ versionBytesNum: 2 })
      const interp = new Interp()
      const verified = interp.verify(
        new Script().fromBuffer(Buffer.from([4, 2, 0, 0, 0])),
        new Script().fromBuffer(Buffer.from([0x65, 0x51, 0x67, 0x00, 0x68])),
        tx,
        0,
        Interp.SCRIPT_VERIFY_P2SH,
        new Bn(0)
      )
      verified.should.equal(true)
      interp.isChronicle().should.equal(true)
    })

    it('should allow a non-clean stack under Chronicle', function () {
      run([0x51], [0x51, 0x51], Interp.defaultFlags).should.equal(false)
      run([0x51], [0x51, 0x51], flags).should.equal(true)
    })

    it('should allow functional opcodes in the unlocking script under Chronicle', function () {
      run([0x51, 0x75], [0x51], Interp.defaultFlags).should.equal(false)
      run([0x51, 0x75], [0x51], flags).should.equal(true)
    })

    it('should let OP_RETURN in the unlocking script end only that script', function () {
      run([0x51, 0x6a, 0x52], [0x51, 0x9c], Interp.defaultFlags).should.equal(false)
      run([0x51, 0x6a, 0x52], [0x51, 0x9c], flags).should.equal(true)
    })
  })
  })
})
