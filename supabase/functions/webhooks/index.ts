import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { apiKeyAuth } from "../_shared/apiKeyAuth.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Webhook Registration & Delivery Edge Function
 *
 * External tools can register webhook URLs to receive real-time
 * notifications when CRM data changes.
 *
 * Endpoints:
 *   GET    /webhooks          → List registered webhooks
 *   POST   /webhooks          → Register a new webhook
 *   DELETE /webhooks/:id      → Remove a webhook
 *   POST   /webhooks/test/:id → Send a test event
 */

// ─── Helpers ──────────────────────────────────────────────────────────

async function deliverWebhook(url: string, event: string, data: unknown) {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Event": event,
            },
            body: JSON.stringify({
                event,
                timestamp: new Date().toISOString(),
                data,
            }),
        });
        return { success: res.ok, status: res.status };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

// ─── Main Handler ─────────────────────────────────────────────────────

Deno.serve(async (req: Request) =>
    OptionsMiddleware(req, async (req) => {
        // Authenticate via API key
        const authResult = await apiKeyAuth(req);
        if (authResult instanceof Response) return authResult;

        const { salesId } = authResult;
        const url = new URL(req.url);
        const pathParts = url.pathname.replace(/^\/webhooks\/?/, "").split("/").filter(Boolean);

        // GET /webhooks → list
        if (req.method === "GET" && pathParts.length === 0) {
            const { data, error } = await supabaseAdmin
                .from("webhooks")
                .select("*")
                .eq("created_by", salesId)
                .order("created_at", { ascending: false });

            if (error) return createErrorResponse(400, error.message);
            return createJsonResponse({ data });
        }

        // POST /webhooks → register
        if (req.method === "POST" && pathParts.length === 0) {
            const body = await req.json();
            if (!body.url) return createErrorResponse(400, "url is required");
            if (!body.events || !Array.isArray(body.events)) {
                return createErrorResponse(400, "events array is required (e.g. ['contact.created', 'deal.updated'])");
            }

            const { data, error } = await supabaseAdmin
                .from("webhooks")
                .insert({
                    url: body.url,
                    events: body.events,
                    created_by: salesId,
                    active: true,
                })
                .select("*")
                .single();

            if (error) return createErrorResponse(400, error.message);
            return createJsonResponse({ data }, 201);
        }

        // POST /webhooks/test/:id → test delivery
        if (req.method === "POST" && pathParts[0] === "test" && pathParts[1]) {
            const { data: webhook } = await supabaseAdmin
                .from("webhooks")
                .select("*")
                .eq("id", parseInt(pathParts[1], 10))
                .eq("created_by", salesId)
                .single();

            if (!webhook) return createErrorResponse(404, "Webhook not found");

            const result = await deliverWebhook(webhook.url, "test", {
                message: "This is a test webhook from Atomic CRM",
            });

            return createJsonResponse({ result });
        }

        // DELETE /webhooks/:id → deactivate
        if (req.method === "DELETE" && pathParts[0]) {
            const { error } = await supabaseAdmin
                .from("webhooks")
                .update({ active: false })
                .eq("id", parseInt(pathParts[0], 10))
                .eq("created_by", salesId);

            if (error) return createErrorResponse(400, error.message);
            return createJsonResponse({ message: "Webhook deactivated" });
        }

        return createErrorResponse(404, "Not found");
    })
);
