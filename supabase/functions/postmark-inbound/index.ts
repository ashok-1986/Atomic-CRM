import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Postmark Inbound Webhook Handler
 * 
 * Receives JSON payload from Postmark when an email is sent to the inbound address.
 * 
 * Configured in Postmark -> Servers -> Inbound -> Webhook URL:
 * https://[PROJECT_ID].supabase.co/functions/v1/postmark-inbound?token=[SECRET]
 */

const POSTMARK_WEBHOOK_TOKEN = Deno.env.get("POSTMARK_WEBHOOK_TOKEN");

Deno.serve(async (req: Request) => {
    // Only handle POST requests
    if (req.method !== "POST") {
        return createErrorResponse(405, "Method Not Allowed");
    }

    // 1. Authenticate Request
    // Validate the secret token to ensure the request is actually from our Postmark config
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!POSTMARK_WEBHOOK_TOKEN) {
        console.error("POSTMARK_WEBHOOK_TOKEN is not configured in Supabase Secrets.");
        return createErrorResponse(500, "Server configuration error.");
    }

    if (token !== POSTMARK_WEBHOOK_TOKEN) {
        return createErrorResponse(401, "Unauthorized: Invalid token.");
    }

    try {
        // 2. Parse Postmark JSON Payload
        const payload = await req.json();

        // Determine the sender's email and name
        const fromEmail = payload.FromFull?.Email || payload.From;
        const fromName = payload.FromFull?.Name || fromEmail.split("@")[0];
        const subject = payload.Subject || "No Subject";
        const textBody = payload.TextBody || "No Content";

        if (!fromEmail) {
            return createErrorResponse(400, "Missing 'From' email in payload.");
        }

        console.log(`Processing inbound email from: ${fromEmail} | Subject: ${subject}`);

        // As this is a generic system, we need an admin or a system sales_id to assign these records.
        // We will assign it to the first active sales representative we find.
        // In a mature system, you might map the 'To' address (e.g., rep1@crm.com) to a specific sales_id.
        const { data: salesReps } = await supabaseAdmin
            .from("sales")
            .select("id")
            .eq("disabled", false)
            .limit(1);

        const defaultSalesId = salesReps?.[0]?.id;

        if (!defaultSalesId) {
            console.error("No active sales representative found to assign inbound records.");
            return createErrorResponse(500, "No active sales rep found.");
        }

        // 3. Contact Resolution (Find or Create)
        let contactId = null;

        const { data: existingContact } = await supabaseAdmin
            .from("contacts")
            .select("id")
            .ilike("email", fromEmail) // Case-insensitive exact match
            .single();

        if (existingContact) {
            contactId = existingContact.id;
            console.log(`Found existing contact ID: ${contactId}`);
        } else {
            console.log(`Contact not found for ${fromEmail}. Creating new contact...`);

            const { data: newContact, error: createError } = await supabaseAdmin
                .from("contacts")
                .insert({
                    first_name: fromName,
                    last_name: "(Auto-created from Email)",
                    email: fromEmail,
                    status: "cold",
                    sales_id: defaultSalesId,
                    background: `Auto-created from inbound email: ${subject}`
                })
                .select("id")
                .single();

            if (createError) {
                console.error("Failed to create contact:", createError);
                throw createError;
            }
            contactId = newContact.id;
            console.log(`Created new contact ID: ${contactId}`);
        }

        // 4. Create Note from Email Body
        if (contactId) {
            const { error: noteError } = await supabaseAdmin
                .from("contact_notes")
                .insert({
                    contact_id: contactId,
                    text: `**Email Subject: ${subject}**\n\n${textBody}`,
                    sales_id: defaultSalesId,
                    date: new Date().toISOString()
                });

            if (noteError) {
                console.error("Failed to create note:", noteError);
                throw noteError;
            }
            console.log("Successfully logged email as a contact note.");
        }

        return createJsonResponse({ message: "Inbound email processed successfully.", contactId });
    } catch (err: any) {
        console.error("Error processing inbound webhook:", err);
        return createErrorResponse(500, "Internal Server Error processing webhook.");
    }
});
