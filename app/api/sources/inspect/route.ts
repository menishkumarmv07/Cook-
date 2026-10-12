import { NextRequest, NextResponse } from "next/server";
import { isAuthConfigurationReady, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { inspectPublicRecipePage, RemoteSourceError } from "@/lib/remote-source";

export const runtime = "nodejs";
export const maxDuration = 10;
const MAX_BODY_BYTES = 4_096;

async function readSmallRequestBody(request: NextRequest): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new RemoteSourceError("INVALID_URL", 413, "The inspection request is too large.");
  }
  if (!request.body) throw new RemoteSourceError("INVALID_URL", 400, "A JSON request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RemoteSourceError("INVALID_URL", 413, "The inspection request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(merged)) as unknown;
  } catch {
    throw new RemoteSourceError("INVALID_URL", 400, "The inspection request must contain valid JSON.");
  }
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Send the source URL as JSON." }, {
      status: 415,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const ownerPassword = process.env.OWNER_PASSWORD;
  const authSecret = process.env.AUTH_SECRET;
  if (!isAuthConfigurationReady(ownerPassword, authSecret)) {
    return NextResponse.json({ error: "Owner-only access is not configured; source inspection is disabled." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!(await verifySessionToken(session, authSecret))) {
    return NextResponse.json({ error: "Authentication required." }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const body = await readSmallRequestBody(request);
    const input = typeof body === "object" && body !== null && "url" in body
      ? (body as { url?: unknown }).url
      : undefined;
    if (typeof input !== "string") {
      return NextResponse.json({ error: "Provide a source URL in the url field." }, {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const source = await inspectPublicRecipePage(input);
    return NextResponse.json({ source }, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    if (error instanceof RemoteSourceError) {
      return NextResponse.json({ error: error.message, code: error.code }, {
        status: error.status,
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      });
    }
    // Do not return network, DNS, socket, or upstream implementation details to the browser.
    return NextResponse.json({ error: "The source page could not be inspected. Check the link and try again." }, {
      status: 502,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
}
