/**
 * Fee models
 * ==========
 *
 * Pluggable fee calculation. A fee model receives a transaction and returns
 * the required fee in satoshis as a Bn.
 */
'use strict'

import { Bn } from './bn'
import { transactionSize } from './tx-size'

class FeeModel {
  computeFee (_tx) {
    throw new Error('not implemented')
  }
}

/** Fee proportional to the exact serialized transaction size. */
class SatoshisPerKilobyte extends FeeModel {
  constructor (satoshisPerKb = 50) {
    super()
    this.satoshisPerKb = satoshisPerKb
  }

  computeFee (tx) {
    const size = transactionSize(tx)
    const fee = new Bn(this.satoshisPerKb)
      .mul(new Bn(size))
      .add(new Bn(999))
      .div(new Bn(1000))
    return fee.lt(1) ? new Bn(1) : fee
  }
}

export { FeeModel, SatoshisPerKilobyte }
