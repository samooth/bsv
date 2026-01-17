import { Block } from './block.js'
import { BlockHeader } from './block-header.js'
import { Tx } from './tx.js'
import { Bw } from './bw.js'
import { Hash } from './hash.js'
import { Merkle } from './merkle.js'
import { VarInt } from './var-int.js'
import { Br } from './br.js'

/**
 * MinableBlock extends Block with mining capabilities
 * Provides both async and sync mining methods while maintaining
 * full compatibility with the original bsv library
 */
export class MinableBlock extends Block {
  constructor(blockHeader, txsVi, txs) {
    super(blockHeader, txsVi, txs)
  }

  /**
   * Mine the block by finding a valid nonce (async, non-blocking)
   * @param {Buffer} target - Difficulty target (32 bytes, big-endian)
   * @param {number} maxIterations - Max attempts (0 = unlimited)
   * @param {function} onProgress - Progress callback
   */
  async mine(target, maxIterations = 0, onProgress = null) {
    return new Promise((resolve) => {
      const start = Date.now()
      const targetHex = target.toString('hex')
      let iterations = 0
      
      // Clone header buffer to modify nonce/timestamp
      const headerBuf = this.blockHeader.toBuffer()

      const loop = () => {
        while (true) {
          if (maxIterations && iterations >= maxIterations) {
            return resolve(false)
          }

          iterations++
          
          // Increment nonce (little-endian at offset 76)
          let nonce = headerBuf.readUInt32LE(76) + 1
          headerBuf.writeUInt32LE(nonce, 76)

          // Update timestamp every 100k iterations
          if (iterations % 100000 === 0) {
            headerBuf.writeUInt32LE(Math.floor(Date.now() / 1000), 68)
          }

          // Check if hash meets target
          const hash = Hash.sha256Sha256(headerBuf)
          if (hash.toString('hex') < targetHex) {
            this.blockHeader.fromBuffer(headerBuf)
            onProgress?.({
              success: true, nonce, iterations, 
              hashrate: iterations / ((Date.now() - start) / 1000),
              hash: hash.toString('hex')
            })
            return resolve(true)
          }

          // Progress callback
          if (onProgress && iterations % 500000 === 0) {
            onProgress({
              success: false, iterations,
              hashrate: iterations / ((Date.now() - start) / 1000)
            })
          }

          // Yield every 1M iterations
          if (iterations % 1000000 === 0) {
            return setImmediate(loop)
          }
        }
      }
      
      loop()
    })
  }

  /** Synchronous mining (blocks event loop, for testing) */
  mineSync(target, maxIterations = 0) {
    const targetHex = target.toString('hex')
    let iterations = 0
    const headerBuf = this.blockHeader.toBuffer()

    while (!maxIterations || iterations < maxIterations) {
      iterations++
      let nonce = headerBuf.readUInt32LE(76) + 1
      headerBuf.writeUInt32LE(nonce, 76)
      
      const hash = Hash.sha256Sha256(headerBuf)
      if (hash.toString('hex') < targetHex) {
        this.blockHeader.fromBuffer(headerBuf)
        return {
          success: true,
          nonce,
          iterations,
          hashrate: iterations / 10,
          hash: hash.toString('hex')
        }
      }
    }
    return {
      success: false,
      iterations,
      hashrate: iterations / 10
    }
  }

  /** Verify proof-of-work against target */
  verifyProofOfWork(target) {
    return this.hash().toString('hex') < target.toString('hex')
  }

  /** Get block hash (returns Buffer) */
  hash() {
    return Hash.sha256Sha256(this.blockHeader.toBuffer())
  }

  /** Get block ID (reversed hex hash) */
  id() {
    return new Br(this.hash()).readReverse().toString('hex')
  }
}

/**
 * Mining utilities for block creation and validation
 */
export class MiningUtils {
  /** Create a minable block from transactions */
  static createBlock(transactions, prevBlockHash, bits) {
    // Create block header
    const header = new BlockHeader({
      version: 0x20000000,
      prevBlockHashBuf: prevBlockHash,
      merkleRootBuf: this.calcMerkleRoot(transactions),
      time: Math.floor(Date.now() / 1000),
      bits,
      nonce: 0
    })

    // Add coinbase as first tx
    const txs = [this.createCoinbaseTx(), ...transactions]
    const txsVi = new VarInt().fromNumber(txs.length)

    return new MinableBlock(header, txsVi, txs)
  }

  /** Calculate merkle root from transactions */
  static calcMerkleRoot(txs) {
    return Merkle.fromBuffers(txs.map(tx => tx.hash())).hash()
  }

  /** Create a simple coinbase transaction */
  static createCoinbaseTx() {
    const tx = new Tx()
    // Add coinbase input and output
    // (Real implementation needs proper coinbase structure)
    return tx
  }

  /** Validate complete block */
  static validateBlock(block, target) {
    if (!block.verifyProofOfWork(target)) {
      throw new Error('Invalid POW')
    }
    if (block.verifyMerkleRoot() !== 0) {
      throw new Error('Invalid merkle root')
    }
    return true
  }
}