/**
 * Background Evaluation Extended Format (BRC-62)
 * ===============================================
 *
 * Layout: version (uint32 LE, 0x0100beef), nBUMPs (varint), BUMP bytes,
 * nTransactions (varint), then for each transaction: raw tx bytes and a flag
 * byte (01 + BUMP index, or 00 for a locally anchored transaction).
 */
'use strict'

import { Bump } from './bump'
import { Reader } from './reader'
import { Tx } from './tx'
import { Writer } from './writer'

const VERSION = 0xefbe0001

class Beef {
  constructor (bumps = [], transactions = []) {
    this.bumps = bumps
    this.transactions = transactions
  }

  fromBr (br) {
    const version = br.readUInt32LE()
    if (version !== VERSION) {
      throw new Error('not a BEEF transaction')
    }
    const nBumps = br.readVarIntNum()
    this.bumps = []
    for (let i = 0; i < nBumps; i++) {
      const start = br.pos
      this.bumps.push(Bump.fromBr(br))
      this.bumps[i].raw = br.buf.slice(start, br.pos)
    }
    const nTxs = br.readVarIntNum()
    this.transactions = []
    for (let i = 0; i < nTxs; i++) {
      const start = br.pos
      const tx = new Tx().fromBr(br)
      const raw = br.buf.slice(start, br.pos)
      const hasBump = br.readUInt8()
      const bumpIndex = hasBump ? br.readVarIntNum() : undefined
      this.transactions.push({ tx, raw, bumpIndex })
    }
    return this
  }

  toBuffer () {
    const bw = new Writer()
    bw.writeUInt32LE(VERSION)
    bw.writeVarIntNum(this.bumps.length)
    for (const bump of this.bumps) {
      bw.write(bump.raw || bump.toBuffer())
    }
    bw.writeVarIntNum(this.transactions.length)
    for (const entry of this.transactions) {
      bw.write(entry.raw || entry.tx.toBuffer())
      if (entry.bumpIndex === undefined) {
        bw.writeUInt8(0)
      } else {
        bw.writeUInt8(1)
        bw.writeVarIntNum(entry.bumpIndex)
      }
    }
    return bw.toBuffer()
  }

  fromBuffer (buf) {
    return this.fromBr(new Reader(buf))
  }

  static fromBuffer (buf) {
    return new Beef().fromBuffer(buf)
  }

  toHex () {
    return this.toBuffer().toString('hex')
  }

  static fromHex (hex) {
    return Beef.fromBuffer(Buffer.from(hex, 'hex'))
  }

  toJSON () {
    return {
      bumps: this.bumps.map(bump => bump.toJSON()),
      transactions: this.transactions.map(entry => ({
        tx: entry.tx.toHex(),
        bumpIndex: entry.bumpIndex
      }))
    }
  }

  static fromJSON (json) {
    return new Beef(
      json.bumps.map(bump => Bump.fromBuffer(Buffer.from(bump.raw, 'hex'))),
      json.transactions.map(entry => ({
        tx: Tx.fromHex(entry.tx),
        bumpIndex: entry.bumpIndex
      }))
    )
  }

  findTxid (txid) {
    return this.transactions.find(entry => entry.tx.id() === txid)
  }

  /** Kahn topological order of the transaction DAG (oldest first). */
  topologicalOrder () {
    const txids = this.transactions.map(entry => entry.tx.id())
    const index = new Map(txids.map((txid, i) => [txid, i]))
    const inDegree = this.transactions.map(() => 0)
    const children = this.transactions.map(() => [])
    this.transactions.forEach((entry, i) => {
      for (const txIn of entry.tx.txIns) {
        const parent = index.get(
          Buffer.from(txIn.txHashBuf).reverse().toString('hex')
        )
        if (parent !== undefined) {
          inDegree[i]++
          children[parent].push(i)
        }
      }
    })
    const queue = []
    for (let i = 0; i < inDegree.length; i++) {
      if (inDegree[i] === 0) queue.push(i)
    }
    const order = []
    while (queue.length) {
      const i = queue.shift()
      order.push(this.transactions[i])
      for (const child of children[i]) {
        if (--inDegree[child] === 0) queue.push(child)
      }
    }
    if (order.length !== this.transactions.length) {
      throw new Error('BEEF transaction graph is not acyclic')
    }
    return order
  }
}

export { Beef }
