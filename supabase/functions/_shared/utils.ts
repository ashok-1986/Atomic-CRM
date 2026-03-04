import { corsHeaders } from "./cors.ts";

export function createErrorResponse(
  status: number,
  message: string,
  custom: Record<string, unknown> = {},
) {
  return new Response(JSON.stringify({ status, message, ...custom }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    status,
  });
}

export function createJsonResponse(
  body: unknown,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    status,
  });
}

