'use strict'
import { Bump } from '../lib/bump'
import should from 'should'

void should

// BRC-74 compound BUMP example, with its two client txids and expected root.
const BUMP_HEX = 'fe8a6a0c000c04fde80b0011774f01d26412f0d16ea3f0447be0b5ebec67b0782e321a7a01cbdf7f734e30fde90b02004e53753e3fe4667073063a17987292cfdea278824e9888e52180581d7188d8fdea0b025e441996fc53f0191d649e68a200e752fb5f39e0d5617083408fa179ddc5c998fdeb0b010001fdfb020101fd7c010093b3efca9b77ddec914f8effac691ecb54e2c81d0ab81cbc4c4b93befe418e8501bf01015e005881826eb6973c54003a02118fe270f03d46d02681c8bc71cd44c613e86302f8012e00e07a2bb8bb75e5accff266022e1e5e6e7b4d6d943a04faadcf2ab4a22f796ff30116008120cafa17309c0bb0e0ffce835286b3a2dcae48e4497ae2d2b7ced4f051507d010a00502e59ac92f46543c23006bff855d96f5e648043f0fb87a7a5949e6a9bebae430104001ccd9f8f64f4d0489b30cc815351cf425e0e78ad79a589350e4341ac165dbe45010301010000af8764ce7e1cc132ab5ed2229a005c87201c9a5ee15c0f91dd53eff31ab30cd4'
const ROOT = '57aab6e6fb1b697174ffb64e062c4728f2ffd33ddcfa02a43b64d8cd29b483b4'
const TXIDS = [
  'd888711d588021e588984e8278a2decf927298173a06737066e43f3e75534e00',
  '98c9c5dd79a18f40837061d5e0395ffb52e700a2689e641d19f053fc9619445e'
]

describe('Bump (BRC-74)', function () {
  it('should parse the reference vector and round-trip', function () {
    const bump = Bump.fromHex(BUMP_HEX)
    bump.blockHeight.should.equal(813706)
    bump.path.length.should.equal(12)
    bump.toHex().should.equal(BUMP_HEX)
  })

  it('should compute the reference merkle root for both txids', function () {
    const bump = Bump.fromHex(BUMP_HEX)
    for (const txid of TXIDS) {
      bump.computeRoot(txid).should.equal(ROOT)
    }
  })

  it('should reject a txid not in the path', function () {
    const bump = Bump.fromHex(BUMP_HEX)
    ;(function () {
      bump.computeRoot('00'.repeat(32))
    }.should.throw('txid is not a client txid in this BUMP'))
  })
})
