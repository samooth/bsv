import { Bip39 } from './bip-39'
import { wordList } from './bip-39-es-wordlist'

class Bip39Es extends Bip39 {
  constructor (mnemonic, seed) {
    super(mnemonic, seed, wordList)
  }
}

export { Bip39Es }
