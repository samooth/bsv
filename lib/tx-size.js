/**
 * Transaction size helpers
 * ========================
 *
 * Exact serialized-size calculations used to estimate fees before signing.
 * Sizes are derived from the BRC-12 raw transaction format.
 */
'use strict'

/** Byte length of a canonical CompactSize encoding. */
const varUintSize = function (val) {
  if (!Number.isSafeInteger(val) || val < 0) {
    throw new RangeError('VarInt value must be a non-negative safe integer.')
  }
  if (val <= 0xfc) return 1
  if (val <= 0xffff) return 3
  if (val <= 0xffffffff) return 5
  return 9
}

/** Serialized byte length of one input with an unlocking script of scriptSize bytes. */
const transactionInputSize = function (scriptSize) {
  return 32 + 4 + varUintSize(scriptSize) + scriptSize + 4
}

/** Serialized byte length of one output with a locking script of scriptSize bytes. */
const transactionOutputSize = function (scriptSize) {
  return varUintSize(scriptSize) + scriptSize + 8
}

/** Exact serialized byte length of a transaction with the given script lengths. */
const transactionSize = function (tx) {
  let size = 4 + varUintSize(tx.txIns.length)
  for (const txIn of tx.txIns) {
    size += transactionInputSize(txIn.script ? txIn.script.toBuffer().length : 0)
  }
  size += varUintSize(tx.txOuts.length)
  for (const txOut of tx.txOuts) {
    size += transactionOutputSize(
      txOut.script ? txOut.script.toBuffer().length : 0
    )
  }
  return size + 4
}

export { varUintSize, transactionInputSize, transactionOutputSize, transactionSize }
