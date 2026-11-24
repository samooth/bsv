# bsv2

[![npm version](https://img.shields.io/npm/v/bsv2.svg)](https://www.npmjs.com/package/bsv2)
[![license](https://img.shields.io/npm/l/bsv2.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

A JavaScript library for Bitcoin SV (BSV). `bsv2` is the maintained continuation
of the `bsv` 2.x codebase: same class-based API, published on npm as
[`bsv2`](https://www.npmjs.com/package/bsv2) and developed at
[github.com/samooth/bsv](https://github.com/samooth/bsv).

## Features

- Transactions and scripts with BSV `SIGHASH_FORKID` semantics.
- Chronicle support: the Original Transaction Digest Algorithm (OTDA), the
  restored opcodes and the opt-in malleability policy.
- A script interpreter with the standard verification flags, plus opt-in
  pre-Genesis and Chronicle policy modes.
- Keys, addresses, BIP32 hierarchical deterministic wallets and BIP39 mnemonics
  (English, Spanish and Japanese wordlists).
- Block and block-header serialization, plus mining utilities.
- ECIES and AES encryption helpers.
- Web Worker support for cryptography-heavy operations.
- Dependency-light, auditable source under `lib/`.
- Ships as ESM, CommonJS and UMD bundles with sourcemaps.

## Install

```bash
npm install bsv2
```

Node.js 18 or newer is required.

```js
// ESM (package.json "type": "module", or a .mjs file)
import { Bn, Tx, Script, KeyPair } from 'bsv2'

// CommonJS
const { Bn, Tx, Script, KeyPair } = require('bsv2')
```

For the browser, use the UMD bundle from a CDN (it exposes the global `bsv2`):

```html
<script src="https://unpkg.com/bsv2/dist/bsv2.umd.js"></script>
<script>
  const { Bn, Tx } = bsv2
</script>
```

| Bundle | Use |
| --- | --- |
| `dist/bsv2.mjs` | ESM (`import`), browsers and modern bundlers |
| `dist/bsv2.cjs` | CommonJS (`require`) |
| `dist/bsv2.umd.js` | `<script>` tag / UMD (global `bsv2`) |

Each bundle has a sibling `.map` file. The package version is also exported as
`version`, and selected third-party dependencies as `deps`.

## Quick start

### Keys and addresses

```js
import { Address, KeyPair } from 'bsv2'

const keyPair = new KeyPair().fromRandom()
const address = Address.fromPubKey(keyPair.pubKey)

console.log(address.toString()) // 1...
```

### Mnemonic and HD wallet

```js
import { Address, Bip32, Bip39 } from 'bsv2'

const mnemonic = new Bip39().fromRandom(128)
const seed = mnemonic.toSeed('') // optional BIP39 passphrase
const accountKey = Bip32.fromSeed(seed).derive("m/44'/0'/0'/0/0")

console.log(mnemonic.toString()) // twelve words for 128 bits of entropy
console.log(Address.fromPubKey(accountKey.pubKey).toString())
```

### Sign and verify a transaction input

This signs a pay-to-pubkey input with `SIGHASH_ALL | SIGHASH_FORKID` and checks
it with the script interpreter. The funding transaction is fabricated here; in
an application you would obtain it from your indexer or node.

```js
import { Bn, Interp, KeyPair, Script, Sig, Tx } from 'bsv2'

const keyPair = new KeyPair().fromRandom()
const scriptPubKey = new Script()
  .writeBuffer(keyPair.pubKey.toDer(true))
  .writeString('OP_CHECKSIG')

const valueBn = new Bn(1000)
const fundingTx = new Tx()
  .addTxIn(Buffer.alloc(32), 0xffffffff, new Script(), 0xffffffff)
  .addTxOut(valueBn, scriptPubKey)

const spendTx = new Tx()
  .addTxIn(fundingTx.hash(), 0, new Script(), 0xffffffff)
  .addTxOut(new Bn(900), scriptPubKey)

const nHashType = Sig.SIGHASH_ALL | Sig.SIGHASH_FORKID
const sig = spendTx.sign(keyPair, nHashType, 0, scriptPubKey, valueBn)
const scriptSig = new Script().writeBuffer(sig.toTxFormat())
spendTx.txIns[0].setScript(scriptSig)

const valid = new Interp().verify(
  scriptSig,
  scriptPubKey,
  spendTx,
  0,
  undefined,
  valueBn
)
console.log(valid) // true
```

`TxVerifier.verify(tx, txOutMap)` is available when you want to validate every
input of a transaction at once.

### Pre-Genesis script policy

BSV Genesis raised several legacy Bitcoin limits. If you need to evaluate an
old script under the original rules, add `Interp.SCRIPT_VERIFY_PREGENESIS_LIMITS`
to the verification flags:

```js
import { Bn, Interp, Script, Tx } from 'bsv2'

const flags = Interp.SCRIPT_VERIFY_P2SH |
  Interp.SCRIPT_VERIFY_STRICTENC |
  Interp.SCRIPT_VERIFY_PREGENESIS_LIMITS

const scriptSig = new Script().fromBitcoindString('2147483648 0 ADD')
const scriptPubKey = new Script().fromBitcoindString('NOP')

// false with the flag: 5-byte script numbers are rejected (4-byte limit)
const valid = new Interp().verify(scriptSig, scriptPubKey, new Tx(), 0, flags, new Bn(0))
```

The flag restores: 4-byte script numbers, 520-byte push limit, 10 KB script
limit, 1000-element stack limit and the pre-Genesis disabled opcodes. It is not
part of `Interp.defaultFlags` and must be requested explicitly.

## Chronicle release

Chronicle activates at mainnet height 943,835, testnet 1,713,022 and regtest
15,000. The library exposes its rules without requiring a block height.

- Set `Sig.SIGHASH_CHRONICLE` (`0x20`) in a signature hash type to select the
  Original Transaction Digest Algorithm (OTDA). ForkID signatures without it
  keep using BIP143. OTDA ignores `valueBn`, and the bit may be mixed across
  inputs.
- `tx.versionBytesNum > 1`, or `Interp.SCRIPT_VERIFY_CHRONICLE`, enables the
  relaxed script policy: minimal encoding, Low-S, MINIMALIF, NULLFAIL,
  NULLDUMMY, clean stack and push-only unlocking scripts are no longer
  enforced. Version-1 transactions keep the checks enabled by the flags.
- Restored opcodes: `OP_VER`, `OP_VERIF`, `OP_VERNOTIF`, `OP_SUBSTR`,
  `OP_LEFT`, `OP_RIGHT`, `OP_2MUL`, `OP_2DIV`, `OP_LSHIFTNUM`, `OP_RSHIFTNUM`.
  `OpCode.OP_SUBSTR_CHRONICLE`, `OP_LEFT_CHRONICLE`, `OP_RIGHT_CHRONICLE`,
  `OP_LSHIFTNUM` and `OP_RSHIFTNUM` hold the new numbers because Genesis
  reassigned the original ones.
- The script-number consensus limit rises to 32 MB; nodes may still set a
  lower policy limit.

`Interp.getFlags('CHRONICLE')` includes the flag, which is not part of
`Interp.defaultFlags`. To sign with OTDA, add the bit to the hash type:

```js
const nHashType = Sig.SIGHASH_ALL | Sig.SIGHASH_FORKID | Sig.SIGHASH_CHRONICLE
const sig = spendTx.sign(keyPair, nHashType, 0, scriptPubKey, valueBn)
```

## API map

All symbols below are exported from the package root (`entry.js`).

| Area | Exports |
| --- | --- |
| Keys and addresses | `KeyPair`, `PrivKey`, `PubKey`, `Address` |
| HD wallets / mnemonics | `Bip32`, `Bip39`, and the `en`, `es`, `jp` wordlists |
| Transactions | `Tx`, `TxIn`, `TxOut`, `TxOutMap`, `TxBuilder`, `TxVerifier`, `Sig`, `SigOperations` |
| Scripts | `Script`, `OpCode`, `Interp` |
| Blocks and mining | `Block`, `MinableBlock`, `BlockHeader`, `MiningUtils`, `getConstants` |
| Cryptography and math | `Bn`, `Point`, `Ecdsa`, `Hash`, `Random`, `Aes`, `Aescbc`, `Cbc`, `Ecies`, `Ach` |
| Serialization / utilities | `Struct`, `Br`, `Bw`, `Bsm`, `VarInt`, `Base58`, `Base58Check`, `cmp`, `Constants` |
| Workers | `Workers`, `WorkersResult` |
| Package | `deps`, `version` |

Additional modules under `lib/` (for example `Msg`, `Version`, `Merkle` and
`HashCache`) are used internally and are not re-exported from the package root.

For the full method-level reference, generate the HTML documentation:

```bash
yarn doc   # writes doc/index.html
```

Instance methods generally mutate the object and return `this`. For example:

```js
const tx = new Tx().addTxIn(...).addTxOut(...)
const hex = tx.toHex()
const sameTx = Tx.fromHex(hex)
```

## Development

```bash
corepack yarn install       # install from yarn.lock
yarn test:run               # run the full suite once (Vitest)
yarn lint                   # ESLint
yarn build                  # build dist/bsv2.{mjs,cjs,umd.js}
yarn doc                    # regenerate API documentation
```

The suite has over 8,500 tests, including reference vectors from bitcoind,
Bitcoin ABC and Bitcoin SV, dedicated pre-Genesis and Chronicle tests, and
deterministic property tests for script, `Bn` and transaction round-trips.
`yarn test` starts Vitest in watch mode.

Scripts with truncated pushdata are parsed leniently and rejected during
execution; the pre-Genesis reference vectors rely on that behaviour.

Commits and release tags are GPG-signed, and `commit.gpgsign` is enabled for
future commits. Releases are published to npm and GitHub Releases with the same
version number. `resolutions` (Yarn) and `overrides` (npm) keep transitive
dependencies pinned to patched versions.

## Differences from upstream `bsv` 2.x

- Published as **`bsv2`**; ESM-first with a matching CommonJS and UMD build.
- Default sighash behaviour follows BSV (`SIGHASH_FORKID`). Pre-Genesis rules
  and the Chronicle release rules are opt-in flags.
- The `Bn` wrapper was rewritten and the script interpreter received targeted
  correctness fixes; see the commit history for details.
- Japanese BIP39 vectors, `Buffer`/`pbkdf2` interoperability and mnemonic
  whitespace validation were fixed.
- Pre-BIP143 sighash vectors are evaluated with forkid disabled, and
  pre-Chronicle ABC vectors whose random `0x20` bit changed meaning are
  excluded from the test suite.

## Security

Please report security issues privately through the repository's security
advisories on GitHub rather than opening a public issue.

## Credits and license

Based on the original `bsv` library by Manuel Araoz and contributors, with
contributions from the `bsv2` community. See `package.json` for the full
contributor list.

[MIT](./LICENSE)
