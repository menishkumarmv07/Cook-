import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { checkServerIdentity, type PeerCertificate } from "node:tls";
import { extractRecipePageHtml, type RecipePageExtraction } from "@/lib/source-extraction";

const MAX_URL_CHARACTERS = 2_048;
const MAX_RESPONSE_BYTES = 900_000;
const MAX_REDIRECTS = 3;
const MAX_TOTAL_FETCH_MS = 8_000;
const USER_AGENT = "CookingCreatorRecipeResearch/1.0 (+user-requested recipe page inspection)";

export type RemoteSourceErrorCode =
  | "INVALID_URL"
  | "BLOCKED_HOST"
  | "SOURCE_TIMEOUT"
  | "SOURCE_TOO_LARGE"
  | "SOURCE_NOT_HTML"
  | "SOURCE_REDIRECT_LIMIT"
  | "SOURCE_UNAVAILABLE";

export class RemoteSourceError extends Error {
  constructor(
    readonly code: RemoteSourceErrorCode,
    readonly status: 400 | 403 | 413 | 415 | 422 | 502 | 504,
    message: string,
  ) {
    super(message);
    this.name = "RemoteSourceError";
  }
}

export type InspectedRecipePage = RecipePageExtraction & {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  redirectCount: number;
  limitation: string;
};

function isInsideIPv4Range(address: string, network: string, prefix: number): boolean {
  const parse = (value: string): number => value.split(".").reduce((result, segment) => (result * 256) + Number(segment), 0);
  const ip = parse(address);
  const base = parse(network);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ip & mask) === (base & mask);
}

export function isPublicIPAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const blocked: Array<[string, number]> = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
      ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
      ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
      ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !blocked.some(([network, prefix]) => isInsideIPv4Range(address, network, prefix));
  }
  if (family !== 6) return false;

  // Only accept global-unicast IPv6 (2000::/3). Parse the first two hextets
  // so documentation, benchmarking, Teredo, 6to4 and other special ranges fail closed.
  const lower = address.toLowerCase().split("%")[0];
  if (lower.includes(".")) return false; // IPv4-embedded IPv6 forms are denied.
  const halves = lower.split("::");
  const parseSide = (side: string) => side ? side.split(":").map((part) => Number.parseInt(part, 16)) : [];
  const left = parseSide(halves[0]);
  const right = parseSide(halves[1] ?? "");
  const zeroCount = 8 - left.length - right.length;
  if (zeroCount < 0) return false;
  const words = [...left, ...Array<number>(zeroCount).fill(0), ...right];
  if (words.length !== 8) return false;
  const first = words[0];
  const second = words[1];
  if (first < 0x2000 || first > 0x3fff) return false;
  // Reject protocol-specific ranges even when they sit inside global-unicast space.
  // 2001:30::/28 is registered for Drone Remote ID identifiers; 3fff::/20 is
  // reserved for documentation. Neither should be treated as a generic public web host.
  if (first === 0x2001 && (
    second <= 0x0001 ||
    second === 0x0002 ||
    second === 0x0db8 ||
    (second >= 0x0010 && second <= 0x001f) ||
    (second >= 0x0030 && second <= 0x003f)
  )) return false;
  if (first === 0x3fff && second <= 0x000f) return false;
  if (first === 0x2002) return false;
  return true;
}

export function validateExternalSourceUrl(input: string): URL {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_URL_CHARACTERS) {
    throw new RemoteSourceError("INVALID_URL", 400, "Enter a complete web URL no longer than 2,048 characters.");
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new RemoteSourceError("INVALID_URL", 400, "That does not look like a valid absolute web URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RemoteSourceError("INVALID_URL", 400, "Only HTTP or HTTPS web pages can be inspected.");
  }
  if (url.username || url.password) {
    throw new RemoteSourceError("INVALID_URL", 400, "URLs containing embedded usernames or passwords are not accepted.");
  }
  if (url.port) {
    throw new RemoteSourceError("INVALID_URL", 400, "Custom network ports are not accepted. Use the website's standard HTTP/HTTPS address.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname.includes(".") || hostname.endsWith(".") || isIP(hostname) !== 0 ||
      ["localhost", "local", "internal", "lan", "home", "test", "invalid", "example"].some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    throw new RemoteSourceError("BLOCKED_HOST", 403, "This host is local, reserved, or not an eligible public website.");
  }

  url.hostname = hostname;
  url.hash = "";
  return url;
}

type PinnedResponse = {
  status: number;
  headers: import("node:http").IncomingHttpHeaders;
  body: string;
};

type PinnedAddress = { address: string; family: number };

async function resolvePublicAddresses(hostname: string, remainingMs: number): Promise<PinnedAddress[]> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new RemoteSourceError("SOURCE_TIMEOUT", 504, "The source host took too long to resolve.")), Math.max(1, remainingMs));
      }),
    ]);
    if (!addresses.length || addresses.some((entry) => !isPublicIPAddress(entry.address))) {
      throw new RemoteSourceError("BLOCKED_HOST", 403, "The source host did not resolve exclusively to public IP addresses.");
    }
    return addresses;
  } catch (error) {
    if (error instanceof RemoteSourceError) throw error;
    throw new RemoteSourceError("SOURCE_UNAVAILABLE", 422, "The source website could not be resolved. Check the URL and try again.");
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function fetchPinnedResponse(url: URL, addresses: PinnedAddress[], timeoutMs: number): Promise<PinnedResponse> {
  return new Promise((resolve, reject) => {
    const address = addresses[0];
    const headers = {
      Host: url.host,
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml;q=0.9",
      "Accept-Encoding": "identity",
      "Cache-Control": "no-cache",
    };
    let settled = false;
    let byteCount = 0;
    const chunks: Buffer[] = [];
    const timeout: { handle?: ReturnType<typeof setTimeout> } = {};

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeout.handle) clearTimeout(timeout.handle);
      reject(error);
    };

    const options = {
      hostname: address.address,
      family: address.family as 4 | 6,
      port: url.protocol === "https:" ? 443 : 80,
      method: "GET" as const,
      path: `${url.pathname}${url.search}`,
      headers,
      agent: false as const,
    };

    const onResponse = (response: import("node:http").IncomingMessage) => {
      const lengthHeader = response.headers["content-length"];
      const length = Number(Array.isArray(lengthHeader) ? lengthHeader[0] : lengthHeader);
      if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
        response.destroy();
        fail(new RemoteSourceError("SOURCE_TOO_LARGE", 413, "The source page is larger than the 900 KB inspection limit."));
        return;
      }
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        byteCount += buffer.length;
        if (byteCount > MAX_RESPONSE_BYTES) {
          response.destroy();
          fail(new RemoteSourceError("SOURCE_TOO_LARGE", 413, "The source page is larger than the 900 KB inspection limit."));
          return;
        }
        chunks.push(buffer);
      });
      response.on("error", (error) => fail(error));
      response.on("end", () => {
        if (settled) return;
        settled = true;
        if (timeout.handle) clearTimeout(timeout.handle);
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    };

    const requestOptions = url.protocol === "https:"
      ? {
          ...options,
          servername: url.hostname,
          rejectUnauthorized: true,
          checkServerIdentity: (_hostname: string, certificate: PeerCertificate) => checkServerIdentity(url.hostname, certificate),
        }
      : options;
    const request = url.protocol === "https:"
      ? httpsRequest(requestOptions, onResponse)
      : httpRequest(requestOptions, onResponse);
    request.on("error", (error) => fail(error));
    timeout.handle = setTimeout(() => {
      request.destroy();
      fail(new RemoteSourceError("SOURCE_TIMEOUT", 504, "The source website took too long to respond."));
    }, Math.max(1, timeoutMs));
    request.end();
  });
}

function getHeader(headers: PinnedResponse["headers"], name: string): string {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function inspectPublicRecipePage(inputUrl: string): Promise<InspectedRecipePage> {
  const requested = validateExternalSourceUrl(inputUrl);
  let current = requested;
  const deadline = Date.now() + MAX_TOTAL_FETCH_MS;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new RemoteSourceError("SOURCE_TIMEOUT", 504, "The source exceeded the total inspection time limit.");

    const addresses = await resolvePublicAddresses(current.hostname, remaining);
    const response = await fetchPinnedResponse(current, addresses, Math.min(3_500, deadline - Date.now()));

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = getHeader(response.headers, "location");
      if (!location) throw new RemoteSourceError("SOURCE_UNAVAILABLE", 422, "The source website returned a redirect without a destination.");
      if (redirectCount === MAX_REDIRECTS) {
        throw new RemoteSourceError("SOURCE_REDIRECT_LIMIT", 422, "The source redirected too many times; try the final page URL directly.");
      }
      try {
        current = validateExternalSourceUrl(new URL(location, current).toString());
      } catch (error) {
        if (error instanceof RemoteSourceError) throw error;
        throw new RemoteSourceError("INVALID_URL", 400, "The source returned an invalid redirect.");
      }
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new RemoteSourceError("SOURCE_UNAVAILABLE", 422, "The source website could not be read. It may block automated requests or require sign-in.");
    }
    const contentType = getHeader(response.headers, "content-type").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new RemoteSourceError("SOURCE_NOT_HTML", 415, "This URL did not return an HTML page. Video/Reel content is not downloaded, transcribed, or visually analyzed by this feature.");
    }

    const extracted = extractRecipePageHtml(response.body, current.hostname);
    return {
      ...extracted,
      requestedUrl: requested.toString(),
      finalUrl: current.toString(),
      contentType: contentType.split(";")[0],
      redirectCount,
      limitation: "Extracted public HTML and optional Schema.org Recipe fields only. Nothing was independently verified. This does not inspect video frames, transcribe audio, or guarantee that every displayed recipe instruction was captured.",
    };
  }

  throw new RemoteSourceError("SOURCE_REDIRECT_LIMIT", 422, "The source redirected too many times.");
}
