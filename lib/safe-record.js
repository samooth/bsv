/**
 * SafeRecord
 * ==========
 *
 * A Map-backed record with validated string keys. Prototype-polluting names
 * are rejected so JSON from untrusted inputs cannot modify object behavior.
 */
'use strict'

const FORBIDDEN = ['__proto__', 'prototype', 'constructor']

class SafeRecord {
  constructor (obj) {
    this.map = new Map()
    if (obj !== undefined) {
      for (const key of Object.keys(obj)) {
        this.set(key, obj[key])
      }
    }
  }

  static checkKey (key) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('key must be a non-empty string')
    }
    if (FORBIDDEN.includes(key)) {
      throw new TypeError('key is not allowed')
    }
  }

  set (key, value) {
    SafeRecord.checkKey(key)
    this.map.set(key, value)
    return this
  }

  get (key) {
    SafeRecord.checkKey(key)
    return this.map.get(key)
  }

  has (key) {
    SafeRecord.checkKey(key)
    return this.map.has(key)
  }

  delete (key) {
    SafeRecord.checkKey(key)
    return this.map.delete(key)
  }

  get size () {
    return this.map.size
  }

  toJSON () {
    const out = {}
    for (const [key, value] of this.map) {
      out[key] = value
    }
    return out
  }

  static fromJSON (json) {
    return new SafeRecord(json)
  }
}

export { SafeRecord }
