import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { apiKeyAuth, generateApiKey } from "../_shared/apiKeyAuth.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

// ─── Helpers ──────────────────────────────────────────────────────────

function parseUrl(req: Request): { resource: string; id?: string; query: URLSearchParams } {
    const url = new URL(req.url);
    // Path: /api/v1/{resource}/{id?}
    const parts = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
    // parts = ["v1", "contacts", "123"] or ["v1", "contacts"]
    const resource = parts[1] ?? "";
    const id = parts[2];
    return { resource, id, query: url.searchParams };
}

const ALLOWED_RESOURCES: Record<string, string> = {
    contacts: "contacts",
    companies: "companies",
    deals: "deals",
    tasks: "tasks",
    "contact-notes": "contact_notes",
    "deal-notes": "deal_notes",
};

// ─── CRUD Handlers ────────────────────────────────────────────────────

async function handleList(
    table: string,
    query: URLSearchParams,
) {
    const page = parseInt(query.get("page") ?? "1", 10);
    const perPage = Math.min(parseInt(query.get("per_page") ?? "25", 10), 100);
    const offset = (page - 1) * perPage;
    const orderBy = query.get("order_by") ?? "id";
    const order = query.get("order") === "desc" ? false : true; // ascending default

    let q = supabaseAdmin
        .from(table)
        .select("*", { count: "exact" })
        .order(orderBy, { ascending: order })
        .range(offset, offset + perPage - 1);

    // Simple field filtering: ?first_name=eq.John&status=eq.active
    for (const [key, value] of query.entries()) {
        if (["page", "per_page", "order_by", "order"].includes(key)) continue;
        if (value.startsWith("eq.")) {
            q = q.eq(key, value.slice(3));
        } else if (value.startsWith("ilike.")) {
            q = q.ilike(key, value.slice(6));
        } else if (value.startsWith("gt.")) {
            q = q.gt(key, value.slice(3));
        } else if (value.startsWith("lt.")) {
            q = q.lt(key, value.slice(3));
        }
    }

    const { data, error, count } = await q;

    if (error) {
        return createErrorResponse(400, error.message);
    }

    return createJsonResponse({
        data,
        meta: {
            page,
            per_page: perPage,
            total: count ?? 0,
            total_pages: Math.ceil((count ?? 0) / perPage),
        },
    });
}

async function handleGet(table: string, id: string) {
    const { data, error } = await supabaseAdmin
        .from(table)
        .select("*")
        .eq("id", parseInt(id, 10))
        .single();

    if (error || !data) {
        return createErrorResponse(404, "Not found");
    }

    return createJsonResponse({ data });
}

async function handleCreate(table: string, req: Request, salesId: number) {
    const body = await req.json();

    // Auto-set sales_id if not provided
    if (!body.sales_id) {
        body.sales_id = salesId;
    }

    const { data, error } = await supabaseAdmin
        .from(table)
        .insert(body)
        .select("*")
        .single();

    if (error) {
        return createErrorResponse(400, error.message);
    }

    return createJsonResponse({ data }, 201);
}

async function handleUpdate(table: string, id: string, req: Request) {
    const body = await req.json();

    const { data, error } = await supabaseAdmin
        .from(table)
        .update(body)
        .eq("id", parseInt(id, 10))
        .select("*")
        .single();

    if (error) {
        return createErrorResponse(400, error.message);
    }

    if (!data) {
        return createErrorResponse(404, "Not found");
    }

    return createJsonResponse({ data });
}

async function handleDelete(table: string, id: string) {
    const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq("id", parseInt(id, 10));

    if (error) {
        return createErrorResponse(400, error.message);
    }

    return new Response(null, { status: 204, headers: corsHeaders });
}

// ─── API Key Management Endpoints ─────────────────────────────────────

async function handleApiKeys(req: Request, salesId: number) {
    // Check if user is admin
    const { data: sale } = await supabaseAdmin
        .from("sales")
        .select("administrator")
        .eq("id", salesId)
        .single();

    if (!sale?.administrator) {
        return createErrorResponse(403, "Admin access required");
    }

    if (req.method === "GET") {
        const { data, error } = await supabaseAdmin
            .from("api_keys")
            .select("id, name, key_prefix, created_by, created_at, last_used_at, revoked_at, permissions")
            .order("created_at", { ascending: false });

        if (error) return createErrorResponse(400, error.message);
        return createJsonResponse({ data });
    }

    if (req.method === "POST") {
        const { name, permissions } = await req.json();
        if (!name) return createErrorResponse(400, "name is required");

        const { rawKey, keyHash, keyPrefix } = await generateApiKey();

        const { data, error } = await supabaseAdmin
            .from("api_keys")
            .insert({
                name,
                key_prefix: keyPrefix,
                key_hash: keyHash,
                created_by: salesId,
                permissions: permissions ?? { read: true, write: true },
            })
            .select("id, name, key_prefix, created_at, permissions")
            .single();

        if (error) return createErrorResponse(400, error.message);

        // Return the raw key ONLY on creation
        return createJsonResponse({
            data: { ...data, key: rawKey },
            message: "Store this key securely — it will not be shown again.",
        }, 201);
    }

    if (req.method === "DELETE") {
        const url = new URL(req.url);
        const parts = url.pathname.split("/").filter(Boolean);
        const keyId = parts[parts.length - 1];

        const { error } = await supabaseAdmin
            .from("api_keys")
            .update({ revoked_at: new Date().toISOString() })
            .eq("id", parseInt(keyId, 10));

        if (error) return createErrorResponse(400, error.message);
        return createJsonResponse({ message: "Key revoked" });
    }

    return createErrorResponse(405, "Method not allowed");
}

// ─── Main Router ──────────────────────────────────────────────────────

Deno.serve(async (req: Request) =>
    OptionsMiddleware(req, async (req) => {
        const url = new URL(req.url);
        const pathParts = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);

        // Health check
        if (pathParts[0] === "v1" && pathParts[1] === "health") {
            return createJsonResponse({ status: "ok", version: "1.0.0" });
        }

        // Authenticate
        const authResult = await apiKeyAuth(req);
        if (authResult instanceof Response) return authResult;

        const { salesId, permissions } = authResult;
        const { resource, id, query } = parseUrl(req);

        // API key management
        if (resource === "api-keys") {
            return handleApiKeys(req, salesId);
        }

        // Validate resource
        const table = ALLOWED_RESOURCES[resource];
        if (!table) {
            return createErrorResponse(404, `Unknown resource: ${resource}. Available: ${Object.keys(ALLOWED_RESOURCES).join(", ")}`);
        }

        // Permission check
        const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method);
        if (isWrite && !permissions.write) {
            return createErrorResponse(403, "This API key does not have write permissions");
        }
        if (req.method === "GET" && !permissions.read) {
            return createErrorResponse(403, "This API key does not have read permissions");
        }

        // Route to handlers
        switch (req.method) {
            case "GET":
                return id ? handleGet(table, id) : handleList(table, query);
            case "POST":
                return handleCreate(table, req, salesId);
            case "PATCH":
            case "PUT":
                if (!id) return createErrorResponse(400, "ID required for update");
                return handleUpdate(table, id, req);
            case "DELETE":
                if (!id) return createErrorResponse(400, "ID required for delete");
                return handleDelete(table, id);
            default:
                return createErrorResponse(405, "Method not allowed");
        }
    })
);
