import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS preflight and proxy for the Chrome extension.
 *
 * The Chrome extension makes cross-origin requests to the AssistJur API.
 * This route handles CORS headers so the extension can authenticate and
 * communicate with the chat API.
 */

const ALLOWED_ORIGINS = [
  "chrome-extension://", // Any Chrome extension
];

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") || "";

  // Allow Chrome extension origins
  const isAllowed = ALLOWED_ORIGINS.some((allowed) =>
    origin.startsWith(allowed)
  );

  if (!isAllowed && origin) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

/** CORS preflight */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

/** Health check for extension */
export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      status: "ok",
      extension: true,
      version: "1.0.0",
    },
    { headers: getCorsHeaders(request) }
  );
}
