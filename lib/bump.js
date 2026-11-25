/**
 * BSV Unified Merkle Path (BRC-74)
 * ================================
 *
 * Binary BUMP: blockHeight (varint), treeHeight (byte), then for each tree
 * level a leaf count (varint) and the leaves:
 *   offset (varint), flags (byte), hash (32 bytes unless flags === 1).
 *
 * flags: 0 = sibling hash, 1 = duplicate working hash, 2 = client txid.
 */
'use strict'

import { Hash } from './hash'
import { Reader } from './reader'
import { Writer } from './writer'

class Bump {
  constructor (blockHeight = 0, path = []) {
    this.blockHeight = blockHeight
    this.path = path
  }

  fromBr (br) {
    this.blockHeight = br.readVarIntNum()
    this.treeHeight = br.readUInt8()
    this.path = []
    for (let level = 0; level < this.treeHeight; level++) {
      const leaves = []
      const nLeaves = br.readVarIntNum()
      for (let i = 0; i < nLeaves; i++) {
        const offset = br.readVarIntNum()
        const flags = br.readUInt8()
        const hash = flags === 1 ? null : br.read(32)
        leaves.push({ offset, flags, hash })
      }
      this.path.push(leaves)
    }
    return this
  }

  toBuffer () {
    const bw = new Writer()
    bw.writeVarIntNum(this.blockHeight)
    bw.writeUInt8(this.treeHeight)
    for (const leaves of this.path) {
      bw.writeVarIntNum(leaves.length)
      for (const leaf of leaves) {
        bw.writeVarIntNum(leaf.offset)
        bw.writeUInt8(leaf.flags)
        if (leaf.flags !== 1) {
          bw.write(leaf.hash)
        }
      }
    }
    return bw.toBuffer()
  }

  static fromBr (br) {
    return new Bump().fromBr(br)
  }

  fromBuffer (buf) {
    return this.fromBr(new Reader(buf))
  }

  static fromBuffer (buf) {
    return new Bump().fromBuffer(buf)
  }

  toHex () {
    return this.toBuffer().toString('hex')
  }

  static fromHex (hex) {
    return Bump.fromBuffer(Buffer.from(hex, 'hex'))
  }

  toJSON () {
    return {
      raw: this.toHex(),
      blockHeight: this.blockHeight,
      path: this.path.map(leaves => leaves.map(leaf => ({
        offset: leaf.offset,
        flags: leaf.flags,
        hash: leaf.hash ? Buffer.from(leaf.hash).reverse().toString('hex') : undefined
      })))
    }
  }

  findLeaf (height, offset) {
    const leaves = this.path[height] || []
    const direct = leaves.find(l => l.offset === offset)
    if (direct) {
      return direct.flags === 1
        ? { offset, duplicate: true }
        : { offset, hash: Buffer.from(direct.hash) }
    }
    if (height === 0) {
      return undefined
    }
    const left = this.findLeaf(height - 1, offset * 2)
    if (!left || !left.hash) {
      return undefined
    }
    const right = this.findLeaf(height - 1, offset * 2 + 1)
    if (!right) {
      return { offset, hash: Hash.sha256Sha256(Buffer.concat([left.hash, left.hash])) }
    }
    const rightHash = right.duplicate ? left.hash : right.hash
    return {
      offset,
      hash: Hash.sha256Sha256(Buffer.concat([left.hash, rightHash]))
    }
  }

  /** Compute the display-form merkle root for a client txid. */
  computeRoot (txid) {
    const target = Buffer.from(txid, 'hex').reverse()
    const level0 = this.path[0] || []
    const leaf = level0.find(l =>
      l.flags === 2 && l.hash && Buffer.from(l.hash).equals(target)
    )
    if (!leaf) {
      throw new Error('txid is not a client txid in this BUMP')
    }

    let working = Buffer.from(target)
    for (let height = 0; height < this.treeHeight; height++) {
      const nodeOffset = Math.floor(leaf.offset / Math.pow(2, height))
      const siblingOffset = nodeOffset % 2 === 0 ? nodeOffset + 1 : nodeOffset - 1
      const sibling = this.findLeaf(height, siblingOffset)
      if (!sibling) {
        throw new Error(
          `Missing hash for index ${leaf.offset} at height ${height}`
        )
      }
      const siblingHash = sibling.duplicate ? working : sibling.hash
      working = siblingOffset % 2 === 1
        ? Hash.sha256Sha256(Buffer.concat([working, siblingHash]))
        : Hash.sha256Sha256(Buffer.concat([siblingHash, working]))
    }
    return Buffer.from(working).reverse().toString('hex')
  }

}

export { Bump }
