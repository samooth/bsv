import crypto from 'crypto'
import { AesGcm } from '../lib/aes-gcm'
import should from 'should'

void should

describe('AES-GCM', function () {
  const key = Buffer.alloc(32, 1)
  const iv = Buffer.alloc(32, 2)
  const plaintext = Buffer.from('BRC-2 AES-GCM compliance')

  const reference = function () {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return { ciphertext, tag: cipher.getAuthTag() }
  }

  it('should match Node AES-256-GCM ciphertext and tag', function () {
    const expected = reference()
    const actual = AesGcm.encrypt(key, iv, plaintext)
    actual.ciphertext.toString('hex').should.equal(expected.ciphertext.toString('hex'))
    actual.tag.toString('hex').should.equal(expected.tag.toString('hex'))
  })

  it('should decrypt and reject a modified tag', function () {
    const encrypted = AesGcm.encrypt(key, iv, plaintext)
    AesGcm.decrypt(key, iv, encrypted.ciphertext, encrypted.tag)
      .toString()
      .should.equal(plaintext.toString())
    const badTag = Buffer.from(encrypted.tag)
    badTag[0] ^= 1
    ;(function () {
      AesGcm.decrypt(key, iv, encrypted.ciphertext, badTag)
    }.should.throw('AES-GCM authentication failed'))
  })

  it('should round-trip BRC-2 framing', function () {
    const framed = AesGcm.encryptBrc2(key, plaintext)
    framed.slice(0, 32).length.should.equal(32)
    framed.slice(-16).length.should.equal(16)
    AesGcm.decryptBrc2(key, framed).toString().should.equal(plaintext.toString())
  })
})
