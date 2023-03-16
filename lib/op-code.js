/*
 * OpCode
 * ======
 *
 * An opCode is one of the operations in the bitcoin scripting language. Each
 * operation is just a number from 0-255, and it has a corresponding string,
 * e.g. "OP_RETURN", which comes from the name of that constant in the bitcoind
 * source code. The way you probably want to use this is with
 * new OpCode(str).toNumber() or new OpCode(num).toString()
 */
'use strict'

import { Struct } from './struct'
const noopmap = {
  // push value
  "FALSE": 0x00,
  "0": 0x00,
  "PUSHDATA1": 0x4c,
  "PUSHDATA2": 0x4d,
  "PUSHDATA4": 0x4e,
  "1NEGATE": 0x4f,
  "RESERVED": 0x50,
  "TRUE": 0x51,
  "1": 0x51,
  "2": 0x52,
  "3": 0x53,
  "4": 0x54,
  "5": 0x55,
  "6": 0x56,
  "7": 0x57,
  "8": 0x58,
  "9": 0x59,
  "10": 0x5a,
  "11": 0x5b,
  "12": 0x5c,
  "13": 0x5d,
  "14": 0x5e,
  "15": 0x5f,
  "16": 0x60,

  // control
  "NOP": 0x61,
  "VER": 0x62,
  "IF": 0x63,
  "NOTIF": 0x64,
  "VERIF": 0x65,
  "VERNOTIF": 0x66,
  "ELSE": 0x67,
  "ENDIF": 0x68,
  "VERIFY": 0x69,
  "RETURN": 0x6a,

  // stack ops
  "TOALTSTACK": 0x6b,
  "FROMALTSTACK": 0x6c,
  "2DROP": 0x6d,
  "2DUP": 0x6e,
  "3DUP": 0x6f,
  "2OVER": 0x70,
  "2ROT": 0x71,
  "2SWAP": 0x72,
  "IFDUP": 0x73,
  "DEPTH": 0x74,
  "DROP": 0x75,
  "DUP": 0x76,
  "NIP": 0x77,
  "OVER": 0x78,
  "PICK": 0x79,
  "ROLL": 0x7a,
  "ROT": 0x7b,
  "SWAP": 0x7c,
  "TUCK": 0x7d,

  // data manipulation ops
  "CAT": 0x7e,
  "SUBSTR": 0x7f, // Replaced in BSV
  "SPLIT": 0x7f,
  "LEFT": 0x80, // Replaced in BSV
  "NUM2BIN": 0x80,
  "RIGHT": 0x81, // Replaced in BSV
  "BIN2NUM": 0x81,
  "SIZE": 0x82,

  // bit logic
  "INVERT": 0x83,
  "AND": 0x84,
  "OR": 0x85,
  "XOR": 0x86,
  "EQUAL": 0x87,
  "EQUALVERIFY": 0x88,
  "RESERVED1": 0x89,
  "RESERVED2": 0x8a,

  // numeric
  "1ADD": 0x8b,
  "1SUB": 0x8c,
  "2MUL": 0x8d,
  "2DIV": 0x8e,
  "NEGATE": 0x8f,
  "ABS": 0x90,
  "NOT": 0x91,
  "0NOTEQUAL": 0x92,

  "ADD": 0x93,
  "SUB": 0x94,
  "MUL": 0x95,
  "DIV": 0x96,
  "MOD": 0x97,
  "LSHIFT": 0x98,
  "RSHIFT": 0x99,

  "BOOLAND": 0x9a,
  "BOOLOR": 0x9b,
  "NUMEQUAL": 0x9c,
  "NUMEQUALVERIFY": 0x9d,
  "NUMNOTEQUAL": 0x9e,
  "LESSTHAN": 0x9f,
  "GREATERTHAN": 0xa0,
  "LESSTHANOREQUAL": 0xa1,
  "GREATERTHANOREQUAL": 0xa2,
  "MIN": 0xa3,
  "MAX": 0xa4,

  "WITHIN": 0xa5,

  // crypto
  "RIPEMD160": 0xa6,
  "SHA1": 0xa7,
  "SHA256": 0xa8,
  "HASH160": 0xa9,
  "HASH256": 0xaa,
  "CODESEPARATOR": 0xab,
  "CHECKSIG": 0xac,
  "CHECKSIGVERIFY": 0xad,
  "CHECKMULTISIG": 0xae,
  "CHECKMULTISIGVERIFY": 0xaf,

  // expansion
  "NOP1": 0xb0,
  "NOP2": 0xb1,
  "CHECKLOCKTIMEVERIFY": 0xb1,
  "NOP3": 0xb2,
  "CHECKSEQUENCEVERIFY": 0xb2,
  "NOP4": 0xb3,
  "NOP5": 0xb4,
  "NOP6": 0xb5,
  "NOP7": 0xb6,
  "NOP8": 0xb7,
  "NOP9": 0xb8,
  "NOP10": 0xb9,

  // template matching params
  "SMALLDATA": 0xf9,
  "SMALLINTEGER": 0xfa,
  "PUBKEYS": 0xfb,
  "PUBKEYHASH": 0xfd,
  "PUBKEY": 0xfe,

  "INVALIDOPCODE": 0xff
}

const map = {
  // push value
  OP_FALSE: 0x00,
  OP_0: 0x00,
  OP_PUSHDATA1: 0x4c,
  OP_PUSHDATA2: 0x4d,
  OP_PUSHDATA4: 0x4e,
  OP_1NEGATE: 0x4f,
  OP_RESERVED: 0x50,
  OP_TRUE: 0x51,
  OP_1: 0x51,
  OP_2: 0x52,
  OP_3: 0x53,
  OP_4: 0x54,
  OP_5: 0x55,
  OP_6: 0x56,
  OP_7: 0x57,
  OP_8: 0x58,
  OP_9: 0x59,
  OP_10: 0x5a,
  OP_11: 0x5b,
  OP_12: 0x5c,
  OP_13: 0x5d,
  OP_14: 0x5e,
  OP_15: 0x5f,
  OP_16: 0x60,

  // control
  OP_NOP: 0x61,
  OP_VER: 0x62,
  OP_IF: 0x63,
  OP_NOTIF: 0x64,
  OP_VERIF: 0x65,
  OP_VERNOTIF: 0x66,
  OP_ELSE: 0x67,
  OP_ENDIF: 0x68,
  OP_VERIFY: 0x69,
  OP_RETURN: 0x6a,

  // stack ops
  OP_TOALTSTACK: 0x6b,
  OP_FROMALTSTACK: 0x6c,
  OP_2DROP: 0x6d,
  OP_2DUP: 0x6e,
  OP_3DUP: 0x6f,
  OP_2OVER: 0x70,
  OP_2ROT: 0x71,
  OP_2SWAP: 0x72,
  OP_IFDUP: 0x73,
  OP_DEPTH: 0x74,
  OP_DROP: 0x75,
  OP_DUP: 0x76,
  OP_NIP: 0x77,
  OP_OVER: 0x78,
  OP_PICK: 0x79,
  OP_ROLL: 0x7a,
  OP_ROT: 0x7b,
  OP_SWAP: 0x7c,
  OP_TUCK: 0x7d,

  // data manipulation ops
  OP_CAT: 0x7e,
  OP_SUBSTR: 0x7f, // Replaced in BSV
  OP_SPLIT: 0x7f,
  OP_LEFT: 0x80, // Replaced in BSV
  OP_NUM2BIN: 0x80,
  OP_RIGHT: 0x81, // Replaced in BSV
  OP_BIN2NUM: 0x81,
  OP_SIZE: 0x82,

  // bit logic
  OP_INVERT: 0x83,
  OP_AND: 0x84,
  OP_OR: 0x85,
  OP_XOR: 0x86,
  OP_EQUAL: 0x87,
  OP_EQUALVERIFY: 0x88,
  OP_RESERVED1: 0x89,
  OP_RESERVED2: 0x8a,

  // numeric
  OP_1ADD: 0x8b,
  OP_1SUB: 0x8c,
  OP_2MUL: 0x8d,
  OP_2DIV: 0x8e,
  OP_NEGATE: 0x8f,
  OP_ABS: 0x90,
  OP_NOT: 0x91,
  OP_0NOTEQUAL: 0x92,

  OP_ADD: 0x93,
  OP_SUB: 0x94,
  OP_MUL: 0x95,
  OP_DIV: 0x96,
  OP_MOD: 0x97,
  OP_LSHIFT: 0x98,
  OP_RSHIFT: 0x99,

  OP_BOOLAND: 0x9a,
  OP_BOOLOR: 0x9b,
  OP_NUMEQUAL: 0x9c,
  OP_NUMEQUALVERIFY: 0x9d,
  OP_NUMNOTEQUAL: 0x9e,
  OP_LESSTHAN: 0x9f,
  OP_GREATERTHAN: 0xa0,
  OP_LESSTHANOREQUAL: 0xa1,
  OP_GREATERTHANOREQUAL: 0xa2,
  OP_MIN: 0xa3,
  OP_MAX: 0xa4,

  OP_WITHIN: 0xa5,

  // crypto
  OP_RIPEMD160: 0xa6,
  OP_SHA1: 0xa7,
  OP_SHA256: 0xa8,
  OP_HASH160: 0xa9,
  OP_HASH256: 0xaa,
  OP_CODESEPARATOR: 0xab,
  OP_CHECKSIG: 0xac,
  OP_CHECKSIGVERIFY: 0xad,
  OP_CHECKMULTISIG: 0xae,
  OP_CHECKMULTISIGVERIFY: 0xaf,

  // expansion
  OP_NOP1: 0xb0,
  OP_NOP2: 0xb1,
  OP_CHECKLOCKTIMEVERIFY: 0xb1,
  OP_NOP3: 0xb2,
  OP_CHECKSEQUENCEVERIFY: 0xb2,
  OP_NOP4: 0xb3,
  OP_NOP5: 0xb4,
  OP_NOP6: 0xb5,
  OP_NOP7: 0xb6,
  OP_NOP8: 0xb7,
  OP_NOP9: 0xb8,
  OP_NOP10: 0xb9,

  // template matching params
  OP_SMALLDATA: 0xf9,
  OP_SMALLINTEGER: 0xfa,
  OP_PUBKEYS: 0xfb,
  OP_PUBKEYHASH: 0xfd,
  OP_PUBKEY: 0xfe,

  OP_INVALIDOPCODE: 0xff
}

class OpCode extends Struct {
  constructor (num) {
    super({ num })
  }

  fromNumber (num) {
    this.num = num
    return this
  }

  static fromNumber (num) {
    return new this().fromNumber(num)
  }

  toNumber () {
    return this.num
  }

  fromString (str) {
    const num = map[str]
    if (num === undefined) {
      throw new Error('Invalid opCodeStr')
    }
    this.num = num
    return this
  }
  fromNoOpString (str) {
    const num = noopmap[str]
    if (num === undefined) {
      throw new Error('Invalid opCodeStr')
    }
    this.num = num
    return this
  }

  static fromString (str) {
    return new this().fromString(str)
  }
  static fromNoOpString (str) {
    return new this().fromNoOpString(str)
  }

  toString () {
    const str = OpCode.str[this.num]
    if (str === undefined) {
      if (this.num > 0 && this.num < OpCode.OP_PUSHDATA1) {
        return this.num.toString()
      }
      throw new Error('OpCode does not have a string representation')
    }
    return str
  }
  toNoOpString () {
    const str = OpCode.noopstr[this.num]
    if (str === undefined) {
      if (this.num > 0 && this.num < Code.OP_PUSHDATA1) {
        return this.num.toString()
      }
      throw new Error('OpCode does not have a string representation')
    }
    return str
  }  
}

OpCode.str = {}
OpCode.noopstr = {}

for (const opCodeStr in map) {
  OpCode[opCodeStr] = map[opCodeStr]

  if (Object.prototype.hasOwnProperty.call(map, opCodeStr)) {
    OpCode.str[map[opCodeStr]] = opCodeStr
  }
}

for (const CodeStr in noopmap) {
  OpCode[CodeStr] = noopmap[CodeStr]

  if (Object.prototype.hasOwnProperty.call(noopmap, CodeStr)) {
    OpCode.noopstr[noopmap[CodeStr]] = CodeStr
  }
}


export { OpCode }
