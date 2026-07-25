import { createHmac } from 'node:crypto';

const UINT32_RANGE = 0x1_0000_0000;

export class DeterministicRandomSource {
  private readonly seed: Buffer;
  private counter = 0n;
  private pool = Buffer.alloc(0);

  constructor(seed: Uint8Array) {
    if (seed.byteLength === 0) {
      throw new Error('Deterministic random source requires a non-empty seed.');
    }

    this.seed = Buffer.from(seed);
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
      throw new Error('maxExclusive must be a positive safe integer no greater than 2^32.');
    }

    const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;

    for (;;) {
      const value = this.nextUint32();
      if (value < limit) {
        return value % maxExclusive;
      }
    }
  }

  private nextUint32(): number {
    if (this.pool.length < 4) {
      this.refill();
    }

    const value = this.pool.readUInt32BE(0);
    this.pool = this.pool.subarray(4);
    return value;
  }

  private refill(): void {
    const counterBytes = Buffer.alloc(8);
    counterBytes.writeBigUInt64BE(this.counter);
    this.counter += 1n;

    const nextBlock = createHmac('sha256', this.seed).update(counterBytes).digest();
    this.pool = Buffer.concat([this.pool, nextBlock]);
  }
}
