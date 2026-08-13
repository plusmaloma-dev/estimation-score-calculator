const UINT32_RANGE = 0x1_0000_0000;

export class DeterministicRandomSource {
  private readonly keyPromise: Promise<CryptoKey>;
  private counter = 0n;
  private pool = new Uint8Array(0);

  constructor(seed: Uint8Array) {
    if (seed.byteLength === 0) {
      throw new Error('Deterministic random source requires a non-empty seed.');
    }
    if (globalThis.crypto?.subtle === undefined) {
      throw new Error('Web Crypto is required for deterministic secure randomness.');
    }

    const seedCopy = new Uint8Array(seed);
    this.keyPromise = globalThis.crypto.subtle.importKey(
      'raw',
      seedCopy,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }

  async nextInt(maxExclusive: number): Promise<number> {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
      throw new Error('maxExclusive must be a positive safe integer no greater than 2^32.');
    }

    const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;

    for (;;) {
      const value = await this.nextUint32();
      if (value < limit) {
        return value % maxExclusive;
      }
    }
  }

  private async nextUint32(): Promise<number> {
    if (this.pool.length < 4) {
      await this.refill();
    }

    const view = new DataView(this.pool.buffer, this.pool.byteOffset, this.pool.byteLength);
    const value = view.getUint32(0, false);
    this.pool = this.pool.slice(4);
    return value;
  }

  private async refill(): Promise<void> {
    const counterBytes = new Uint8Array(8);
    new DataView(counterBytes.buffer).setBigUint64(0, this.counter, false);
    this.counter += 1n;

    const signature = await globalThis.crypto.subtle.sign(
      'HMAC',
      await this.keyPromise,
      counterBytes,
    );
    const nextBlock = new Uint8Array(signature);
    const combined = new Uint8Array(this.pool.length + nextBlock.length);
    combined.set(this.pool, 0);
    combined.set(nextBlock, this.pool.length);
    this.pool = combined;
  }
}
