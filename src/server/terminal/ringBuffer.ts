export class RingBuffer {
  private readonly chunks: string[] = [];
  private size = 0;

  constructor(private readonly maxBytes: number) {}

  append(chunk: string): void {
    if (!chunk) {
      return;
    }

    // 终端输出是连续字节流，不存在稳定的消息边界，因此按字节上限裁剪。
    this.chunks.push(chunk);
    this.size += Buffer.byteLength(chunk, 'utf8');

    while (this.size > this.maxBytes && this.chunks.length > 1) {
      const removed = this.chunks.shift();
      if (!removed) {
        break;
      }
      this.size -= Buffer.byteLength(removed, 'utf8');
    }

    if (this.size > this.maxBytes && this.chunks.length === 1) {
      const lastChunk = this.chunks[0];
      const trimmed = trimChunkFromStart(lastChunk, this.maxBytes);
      this.chunks[0] = trimmed;
      this.size = Buffer.byteLength(trimmed, 'utf8');
    }
  }

  snapshot(): string[] {
    return [...this.chunks];
  }

  clear(): void {
    this.chunks.length = 0;
    this.size = 0;
  }
}

function trimChunkFromStart(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) {
    return value;
  }

  let start = 0;
  while (start < value.length) {
    const candidate = value.slice(start);
    if (Buffer.byteLength(candidate, 'utf8') <= maxBytes) {
      return candidate;
    }
    start += 1;
  }

  return '';
}
