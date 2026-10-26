/**
 * Minimal, fail-closed EBML helper for browser-recorded WebM.
 *
 * Chromium's MediaRecorder can create a decodable WebM whose Segment Info
 * omits Duration, leaving duration=Infinity/NaN when a player reopens the file.
 * We add the Matroska Duration element (in the file's TimecodeScale units) while
 * preserving element sizes and updating known SeekHead/Cues offsets. We reject
 * files with CRC elements that this small local patcher cannot safely recompute.
 * No source footage leaves the browser.
 */

const SEGMENT_ID = 0x18538067;
const INFO_ID = 0x1549a966;
const DURATION_ID = 0x4489;
const TIMECODE_SCALE_ID = 0x2ad7b1;
const CRC32_ID = 0xbf;
const SEEK_HEAD_ID = 0x114d9b74;
const SEEK_ID = 0x4dbb;
const SEEK_POSITION_ID = 0x53ac;
const CUES_ID = 0x1c53bb6b;
const CUE_POINT_ID = 0xbb;
const CUE_TRACK_POSITIONS_ID = 0xb7;
const CUE_CLUSTER_POSITION_ID = 0xf1;
const DEFAULT_TIMECODE_SCALE_NS = 1_000_000;

type EbmlElement = {
  id: number;
  start: number;
  idLength: number;
  sizeStart: number;
  sizeLength: number;
  dataStart: number;
  dataLength: number;
  end: number;
  unknownSize: boolean;
};

type SizeVint = { length: number; value: number; unknown: boolean };

function markerLength(first: number, maximum: number): number {
  if (first === 0) throw new Error("Invalid EBML variable-length integer.");
  let mask = 0x80;
  for (let length = 1; length <= maximum; length += 1, mask >>= 1) {
    if ((first & mask) !== 0) return length;
  }
  throw new Error("EBML integer exceeds the supported header width.");
}

function readId(bytes: Uint8Array, offset: number): { id: number; length: number } {
  if (offset < 0 || offset >= bytes.length) throw new Error("Truncated EBML element ID.");
  const length = markerLength(bytes[offset], 4);
  if (offset + length > bytes.length) throw new Error("Truncated EBML element ID.");
  let id = 0;
  for (let index = 0; index < length; index += 1) id = id * 256 + bytes[offset + index];
  return { id, length };
}

function readSizeVint(bytes: Uint8Array, offset: number): SizeVint {
  if (offset < 0 || offset >= bytes.length) throw new Error("Truncated EBML element size.");
  const length = markerLength(bytes[offset], 8);
  if (offset + length > bytes.length) throw new Error("Truncated EBML element size.");
  const marker = 1 << (8 - length);
  let value = BigInt(bytes[offset] & (marker - 1));
  for (let index = 1; index < length; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  const allOnes = (1n << BigInt(7 * length)) - 1n;
  const unknown = value === allOnes;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("EBML element exceeds safe browser size limits.");
  return { length, value: Number(value), unknown };
}

function encodeSizeVint(value: number, preferredLength?: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid EBML payload size.");
  const fits = (width: number) => BigInt(value) <= ((1n << BigInt(7 * width)) - 2n);
  let length = preferredLength ?? 1;
  if (preferredLength !== undefined && fits(preferredLength)) {
    length = preferredLength;
  } else {
    length = 1;
    while (length <= 8 && !fits(length)) length += 1;
  }
  if (length > 8) throw new Error("Updated WebM segment exceeds EBML size limits.");
  let remaining = BigInt(value);
  const result = new Uint8Array(length);
  for (let index = length - 1; index >= 0; index -= 1) {
    result[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  result[0] |= 1 << (8 - length);
  return result;
}

function readElement(bytes: Uint8Array, offset: number): EbmlElement {
  const { id, length: idLength } = readId(bytes, offset);
  const sizeStart = offset + idLength;
  const size = readSizeVint(bytes, sizeStart);
  const dataStart = sizeStart + size.length;
  if (size.unknown) {
    return {
      id, start: offset, idLength, sizeStart, sizeLength: size.length, dataStart,
      dataLength: bytes.length - dataStart, end: bytes.length, unknownSize: true,
    };
  }
  const end = dataStart + size.value;
  if (end > bytes.length) throw new Error("An EBML element extends beyond the WebM file.");
  return {
    id, start: offset, idLength, sizeStart, sizeLength: size.length, dataStart,
    dataLength: size.value, end, unknownSize: false,
  };
}

function childElements(bytes: Uint8Array, parent: EbmlElement): EbmlElement[] {
  if (parent.unknownSize) throw new Error("Cannot safely inspect an unknown-size EBML parent.");
  const children: EbmlElement[] = [];
  let cursor = parent.dataStart;
  while (cursor < parent.end) {
    const child = readElement(bytes, cursor);
    if (child.unknownSize || child.end <= cursor || child.end > parent.end) {
      throw new Error("A child of the WebM metadata has an unsupported unknown or invalid size.");
    }
    children.push(child);
    cursor = child.end;
  }
  if (cursor !== parent.end) throw new Error("EBML child elements do not align with their parent size.");
  return children;
}

function readUnsigned(bytes: Uint8Array, element: EbmlElement): number {
  if (element.dataLength < 1 || element.dataLength > 8) throw new Error("Invalid unsigned EBML integer length.");
  let value = 0n;
  for (let index = element.dataStart; index < element.end; index += 1) {
    value = (value << 8n) | BigInt(bytes[index]);
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("EBML integer exceeds safe browser limits.");
  return Number(value);
}

function writeUnsigned(bytes: Uint8Array, offset: number, width: number, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || width < 1 || width > 8 ||
      BigInt(value) > ((1n << BigInt(width * 8)) - 1n)) {
    throw new Error("A WebM SeekHead/Cues offset cannot be updated safely.");
  }
  let remaining = BigInt(value);
  for (let index = width - 1; index >= 0; index -= 1) {
    bytes[offset + index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function findSegmentAndInfo(bytes: Uint8Array): { segment: EbmlElement; info: EbmlElement; scaleNs: number } {
  let cursor = 0;
  let segment: EbmlElement | null = null;
  while (cursor < bytes.length) {
    const element = readElement(bytes, cursor);
    if (element.id === SEGMENT_ID) {
      segment = element;
      break;
    }
    if (element.unknownSize || element.end <= cursor) {
      throw new Error("Could not safely find the WebM Segment element.");
    }
    cursor = element.end;
  }
  if (!segment) throw new Error("The recording is not a recognizable EBML/WebM file.");

  let info: EbmlElement | null = null;
  let timecodeScaleNs = DEFAULT_TIMECODE_SCALE_NS;
  let segmentCursor = segment.dataStart;
  while (segmentCursor < segment.end) {
    const child = readElement(bytes, segmentCursor);
    if (child.id === INFO_ID) {
      if (child.unknownSize) throw new Error("The WebM Info element has an unsupported unknown size.");
      info = child;
      const infoChildren = childElements(bytes, child);
      if (infoChildren.some((element) => element.id === CRC32_ID)) {
        throw new Error("This WebM Info element includes CRC protection that V3 cannot safely update; use the production bundle fallback.");
      }
      const scaleElement = infoChildren.find((element) => element.id === TIMECODE_SCALE_ID);
      if (scaleElement) timecodeScaleNs = readUnsigned(bytes, scaleElement);
      break;
    }
    if (child.id === CRC32_ID) {
      throw new Error("This WebM Segment includes CRC protection that V3 cannot safely update; use the production bundle fallback.");
    }
    if (child.unknownSize) break;
    if (child.end <= segmentCursor) throw new Error("Invalid WebM Segment element boundary.");
    segmentCursor = child.end;
  }
  if (!info) throw new Error("The WebM recording has no safely editable Segment Info element.");
  if (!Number.isSafeInteger(timecodeScaleNs) || timecodeScaleNs <= 0) {
    throw new Error("The WebM TimecodeScale value is invalid.");
  }
  return { segment, info, scaleNs: timecodeScaleNs };
}

function getReferencePatchDescriptors(
  bytes: Uint8Array,
  segment: EbmlElement,
  info: EbmlElement,
): Array<{ dataOffset: number; width: number; value: number }> {
  const result: Array<{ dataOffset: number; width: number; value: number }> = [];
  if (info.unknownSize) return result;
  const infoEnd = info.end;
  let cursor = segment.dataStart;
  while (cursor < segment.end) {
    const top = readElement(bytes, cursor);
    if (top.unknownSize) break;
    if (top.id === CRC32_ID) {
      throw new Error("This WebM Segment includes CRC protection that V3 cannot safely update; use the production bundle fallback.");
    }
    if (top.id === SEEK_HEAD_ID) {
      const seeks = childElements(bytes, top);
      if (seeks.some((element) => element.id === CRC32_ID)) {
        throw new Error("This WebM SeekHead includes CRC protection that V3 cannot safely update.");
      }
      for (const seek of seeks.filter((element) => element.id === SEEK_ID)) {
        const fields = childElements(bytes, seek);
        const position = fields.find((element) => element.id === SEEK_POSITION_ID);
        if (!position) continue;
        const relativeTarget = readUnsigned(bytes, position);
        if (segment.dataStart + relativeTarget >= infoEnd) {
          result.push({ dataOffset: position.dataStart, width: position.dataLength, value: relativeTarget });
        }
      }
    } else if (top.id === CUES_ID) {
      const cuePoints = childElements(bytes, top);
      if (cuePoints.some((element) => element.id === CRC32_ID)) {
        throw new Error("This WebM Cues element includes CRC protection that V3 cannot safely update.");
      }
      for (const point of cuePoints.filter((element) => element.id === CUE_POINT_ID)) {
        const positions = childElements(bytes, point);
        for (const trackPositions of positions.filter((element) => element.id === CUE_TRACK_POSITIONS_ID)) {
          const cueFields = childElements(bytes, trackPositions);
          const clusterPosition = cueFields.find((element) => element.id === CUE_CLUSTER_POSITION_ID);
          if (!clusterPosition) continue;
          const relativeTarget = readUnsigned(bytes, clusterPosition);
          if (segment.dataStart + relativeTarget >= infoEnd) {
            result.push({ dataOffset: clusterPosition.dataStart, width: clusterPosition.dataLength, value: relativeTarget });
          }
        }
      }
    }
    cursor = top.end;
  }
  return result;
}

/** Read finite Duration metadata, for tests and post-patch verification. */
export function readV3WebmDurationMs(bytes: Uint8Array): number | null {
  try {
    const { info, scaleNs } = findSegmentAndInfo(bytes);
    const duration = childElements(bytes, info).find((element) => element.id === DURATION_ID);
    if (!duration || duration.dataLength !== 8) return null;
    const units = new DataView(bytes.buffer, bytes.byteOffset + duration.dataStart, 8).getFloat64(0, false);
    const milliseconds = units * scaleNs / 1_000_000;
    return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : null;
  } catch {
    return null;
  }
}

/**
 * Inject or update WebM Duration metadata without transcoding.
 * The duration must already have been measured by the browser decoder against
 * the planned timeline; this helper never derives video duration from a guess.
 */
export function patchV3WebmDurationBytes(bytes: Uint8Array, durationMs: number): Uint8Array {
  if (bytes.length < 16 || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) {
    throw new Error("The recorded file does not have a valid EBML/WebM signature.");
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 600_000) {
    throw new Error("A safe, positive measured WebM duration is required.");
  }
  const { segment, info, scaleNs } = findSegmentAndInfo(bytes);
  const infoChildren = childElements(bytes, info);
  if (infoChildren.some((element) => element.id === CRC32_ID)) {
    throw new Error("This WebM Info element includes CRC protection that V3 cannot safely update.");
  }
  const durationUnits = durationMs * 1_000_000 / scaleNs;
  if (!Number.isFinite(durationUnits) || durationUnits <= 0) throw new Error("The WebM Duration value is invalid.");
  const durationElement = infoChildren.find((element) => element.id === DURATION_ID);
  let patched: Uint8Array;
  let infoDelta = 0;
  if (durationElement) {
    if (durationElement.dataLength !== 8) throw new Error("The existing WebM Duration element has an unsupported width.");
    patched = bytes.slice();
    new DataView(patched.buffer, patched.byteOffset + durationElement.dataStart, 8).setFloat64(0, durationUnits, false);
  } else {
    const durationBytes = new Uint8Array(11);
    durationBytes.set([0x44, 0x89, 0x88], 0);
    new DataView(durationBytes.buffer).setFloat64(3, durationUnits, false);
    const newInfoPayload = concatBytes([bytes.slice(info.dataStart, info.end), durationBytes]);
    const newInfoSize = encodeSizeVint(newInfoPayload.byteLength, info.sizeLength);
    const rebuiltInfo = concatBytes([bytes.slice(info.start, info.sizeStart), newInfoSize, newInfoPayload]);
    infoDelta = rebuiltInfo.byteLength - (info.end - info.start);
    patched = concatBytes([bytes.slice(0, info.start), rebuiltInfo, bytes.slice(info.end)]);
  }

  if (infoDelta !== 0) {
    const references = getReferencePatchDescriptors(bytes, segment, info);
    for (const reference of references) {
      const patchedOffset = reference.dataOffset + (reference.dataOffset >= info.end ? infoDelta : 0);
      writeUnsigned(patched, patchedOffset, reference.width, reference.value + infoDelta);
    }
  }

  if (!segment.unknownSize) {
    const newSegmentSize = segment.dataLength + infoDelta;
    const newSizeBytes = encodeSizeVint(newSegmentSize, segment.sizeLength);
    if (newSizeBytes.byteLength === segment.sizeLength) {
      patched.set(newSizeBytes, segment.sizeStart);
    } else {
      patched = concatBytes([patched.slice(0, segment.sizeStart), newSizeBytes, patched.slice(segment.dataStart)]);
    }
  }

  const resultDuration = readV3WebmDurationMs(patched);
  if (resultDuration === null || Math.abs(resultDuration - durationMs) > 5) {
    throw new Error("The WebM Duration metadata could not be safely written and verified.");
  }
  return patched;
}

export async function patchV3WebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const patched = patchV3WebmDurationBytes(bytes, durationMs);
  return new Blob([patched.buffer as ArrayBuffer], { type: blob.type || "video/webm" });
}
