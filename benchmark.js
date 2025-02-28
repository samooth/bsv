const bsv2 = require('./dist/bsv2.umd.js')
const { Address, PrivKey, PubKey, TxBuilder, TxOut, Random, Bn, KeyPair } = bsv2

const randhex = 'adf4953b2e679fdc453d9cec93ba26c3bd9f0fb875975f3d72ed0c6c6835e26e'
const randbn = new Bn().fromHex(randhex)
const privateKey = PrivKey.fromBn(randbn)
const publicKey = PubKey.fromPrivKey(privateKey)
const keyPair = new KeyPair(privateKey, publicKey)
const fromAddress = Address.fromPrivKey(privateKey)
const toAddress = fromAddress
const changeAddress = toAddress

const n = 10000
const satoshis = 1e3
// const total = satoshis * n - satoshis / 2
let txb = new TxBuilder()
for (let i = 0; i < n; i++) {
  const txOut = TxOut.fromProperties(new Bn(satoshis), fromAddress.toTxOutScript())
  const txHashBuf = Random.getRandomBuffer(32)
  const txOutNum = 0
  txb.inputFromPubKeyHash(txHashBuf, txOutNum, txOut, publicKey)
}
txb = txb.outputToAddress(new Bn(satoshis), toAddress)
txb = txb.setChangeAddress(changeAddress)
txb.setFeePerKbNum(500)
const useAllInputs = true

{
  const start = Date.now()
  txb.build({ useAllInputs })
  const finish = Date.now()
  console.log('building: ', finish - start, 'ms')
}

{
  const start = Date.now()
  for (let i = 0; i < txb.txIns.length; i++) {
    txb.signTxIn(i, keyPair)
  }
  const finish = Date.now()
  console.log('', n, 'inputs', 'signing: ', finish - start, 'ms')
}
