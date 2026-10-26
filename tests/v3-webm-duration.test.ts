import assert from "node:assert/strict";
import test from "node:test";
import { patchV3WebmDurationBytes, readV3WebmDurationMs } from "../lib/v3-webm-duration";

function element(id: number[], payload: number[]): number[] {
  if (payload.length > 126) throw new Error("Test fixture only supports one-byte EBML sizes.");
  return [...id, 0x80 | payload.length, ...payload];
}

function uintElement(id: number[], value: number, width: number): number[] {
  const payload = Array.from({ length: width }, (_, index) =>
    (value >>> ((width - index - 1) * 8)) & 0xff,
  );
  return element(id, payload);
}

function minimalWebm(options: { seekToTracks?: boolean; finiteSegment?: boolean } = {}): Uint8Array {
  const ebmlHeader = [0x1a, 0x45, 0xdf, 0xa3, 0x80]; // valid empty EBML header for parser fixture
  const scale = uintElement([0x2a, 0xd7, 0xb1], 1_000_000, 3);
  const info = element([0x15, 0x49, 0xa9, 0x66], scale);
  const tracks = [0x16, 0x54, 0xae, 0x6b, 0x80];

  let seekHead: number[] = [];
  if (options.seekToTracks) {
    const seekId = element([0x53, 0xab], tracks.slice(0, 4));
    // The position is a one-byte unsigned integer so its encoded width remains stable.
    const seekPosition = element([0x53, 0xac], [0]);
    const seek = element([0x4d, 0xbb], [...seekId, ...seekPosition]);
    seekHead = element([0x11, 0x4d, 0x9b, 0x74], seek);
    const relativeTracksOffset = seekHead.length + info.length;
    const positionByte = seekHead.length - 1;
    seekHead[positionByte] = relativeTracksOffset;
  }

  const payload = [...seekHead, ...info, ...tracks];
  const segmentHeader = options.finiteSegment
    ? [0x18, 0x53, 0x80, 0x67, 0x80 | payload.length]
    : [0x18, 0x53, 0x80, 0x67, 0xff];
  return new Uint8Array([...ebmlHeader, ...segmentHeader, ...payload]);
}

test("adds finite Duration metadata to a MediaRecorder-style WebM Info element", () => {
  const source = minimalWebm();
  assert.equal(readV3WebmDurationMs(source), null);

  const patched = patchV3WebmDurationBytes(source, 1_600);
  assert.equal(readV3WebmDurationMs(patched), 1_600);
  assert.equal(patched.length, source.length + 11);
  assert.equal(patched[0], 0x1a);
  assert.deepEqual(Array.from(patched.slice(5, 9)), [0x18, 0x53, 0x80, 0x67]);

  const updated = patchV3WebmDurationBytes(patched, 2_250);
  assert.equal(readV3WebmDurationMs(updated), 2_250);
  assert.equal(updated.length, patched.length, "updating existing Duration must not change the container size");
});

test("updates a finite Segment size when Duration is inserted", () => {
  const source = minimalWebm({ finiteSegment: true });
  const oldSegmentSize = source[9];
  const patched = patchV3WebmDurationBytes(source, 800);
  assert.equal(patched[9], oldSegmentSize + 11);
  assert.equal(readV3WebmDurationMs(patched), 800);
});

test("updates SeekHead offsets that point to tracks after the extended Info element", () => {
  const source = minimalWebm({ seekToTracks: true });
  const segmentDataStart = 10; // 5-byte EBML header, then the 4-byte Segment ID and 1-byte size.
  const seekHeadPayloadStart = segmentDataStart;
  const seekHeadElementSize = source[seekHeadPayloadStart + 4] & 0x7f;
  assert.ok(seekHeadElementSize > 0);

  const patched = patchV3WebmDurationBytes(source, 1_200);
  const positionId = [0x53, 0xac];
  const positionIndex = (() => {
    for (let index = seekHeadPayloadStart; index < seekHeadPayloadStart + 32; index += 1) {
      if (patched[index] === positionId[0] && patched[index + 1] === positionId[1]) return index;
    }
    return -1;
  })();
  assert.ok(positionIndex >= 0, "SeekPosition element should remain present");
  const positionValue = patched[positionIndex + 3];
  const seekHeadTotalLength = 5 + seekHeadElementSize;
  const originalRelativeTracksOffset = source[seekHeadPayloadStart + seekHeadTotalLength - 1];
  assert.equal(positionValue, originalRelativeTracksOffset + 11);
  assert.equal(readV3WebmDurationMs(patched), 1_200);
});

test("rejects malformed files and unsafe durations instead of emitting a damaged WebM", () => {
  assert.throws(() => patchV3WebmDurationBytes(new Uint8Array([1, 2, 3]), 1_000), /EBML\/WebM signature/i);
  assert.throws(() => patchV3WebmDurationBytes(minimalWebm(), 0), /positive measured WebM duration/i);
  assert.throws(() => patchV3WebmDurationBytes(minimalWebm(), Number.NaN), /positive measured WebM duration/i);
});
