import { createErrorResponse } from "./utils.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

/**
 * Middleware that authenticates requests via X-API-Key header.
 * Hashes the provided key and looks it up in the api_keys table.
 * Returns the associated sales_id for RLS context.
 */
export async function apiKeyAuth(
    req: Request
): Promise<{ salesId: number; keyId: number; permissions: Record<string, boolean> } | Response> {
    const apiKey = req.headers.get("x-api-key");

    if (!apiKey) {
        return createErrorResponse(401, "Missing X-API-Key header");
    }

    // Hash the key using SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Look up the key
    const { data: keyRecord, error } = await supabaseAdmin
        .from("api_keys")
        .select("id, created_by, permissions, revoked_at")
        .eq("key_hash", keyHash)
        .single();

    if (error || !keyRecord) {
        return createErrorResponse(401, "Invalid API key");
    }

    if (keyRecord.revoked_at) {
        return createErrorResponse(401, "API key has been revoked");
    }

    // Update last_used_at (fire-and-forget)
    supabaseAdmin
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyRecord.id)
        .then(() => { });

    return {
        salesId: keyRecord.created_by,
        keyId: keyRecord.id,
        permissions: keyRecord.permissions as Record<string, boolean>,
    };
}

/**
 * Generate a new API key. Returns the raw key (show once) and the hash (store).
 */
export async function generateApiKey(): Promise<{
    rawKey: string;
    keyHash: string;
    keyPrefix: string;
}> {
    // Generate a 32-byte random key
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const rawKey =
        "ak_" +
        Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

    // Hash it
    const encoder = new TextEncoder();
    const data = encoder.encode(rawKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const keyPrefix = rawKey.substring(0, 11); // "ak_" + 8 chars

    return { rawKey, keyHash, keyPrefix };
}
