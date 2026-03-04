import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// ─── CRM Context Loader ──────────────────────────────────────────────

async function loadCrmContext() {
    const [contacts, companies, deals] = await Promise.all([
        supabaseAdmin.from("contacts").select("id, first_name, last_name, title, status, company_id, background, linkedin_url").limit(200),
        supabaseAdmin.from("companies").select("id, name, sector, website").limit(100),
        supabaseAdmin.from("deals").select("id, name, stage, category, amount, company_id, description").limit(100),
    ]);

    return {
        contacts: contacts.data ?? [],
        companies: companies.data ?? [],
        deals: deals.data ?? [],
    };
}

// Build a system prompt with CRM data
async function buildSystemPrompt() {
    const ctx = await loadCrmContext();

    return `You are an AI assistant for a CRM (Customer Relationship Management) system called Atomic CRM.
You help sales teams manage their contacts, companies, deals, and tasks.

CURRENT CRM DATA:
- ${ctx.contacts.length} contacts
- ${ctx.companies.length} companies  
- ${ctx.deals.length} deals

CONTACTS (sample):
${JSON.stringify(ctx.contacts.slice(0, 50), null, 1)}

COMPANIES:
${JSON.stringify(ctx.companies, null, 1)}

DEALS:
${JSON.stringify(ctx.deals, null, 1)}

CAPABILITIES:
- Answer questions about CRM data (contacts, companies, deals)
- Provide insights and analysis (e.g. pipeline value, deal stages)
- Suggest next actions for contacts or deals
- Draft emails or messages for outreach
- Help with data cleanup suggestions

RULES:
- Be concise and actionable
- When listing data, format it clearly
- Reference specific contacts/companies/deals by name
- If asked to perform actions (create, update, delete), explain what should be done but note you cannot modify data directly
- Use markdown formatting for clarity`;
}

// ─── Gemini API Call ──────────────────────────────────────────────────

async function callGemini(userMessage: string, conversationHistory: Array<{ role: string; text: string }>) {
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not configured. Set it in Supabase Edge Function secrets.");
    }

    const systemPrompt = await buildSystemPrompt();

    // Build contents array with conversation history
    const contents = [];

    // Add conversation history
    for (const msg of conversationHistory) {
        contents.push({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.text }],
        });
    }

    // Add current user message
    contents.push({
        role: "user",
        parts: [{ text: userMessage }],
    });

    const response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            system_instruction: {
                parts: [{ text: systemPrompt }],
            },
            contents,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
            },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error("Gemini API error:", error);
        throw new Error(`Gemini API error (${response.status})`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
        throw new Error("No response from Gemini");
    }

    return text;
}

// ─── Contact Insights ─────────────────────────────────────────────────

async function getContactInsights(contactId: number) {
    const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("*")
        .eq("id", contactId)
        .single();

    if (!contact) throw new Error("Contact not found");

    const [notes, tasks, company] = await Promise.all([
        supabaseAdmin.from("contact_notes").select("*").eq("contact_id", contactId).order("date", { ascending: false }).limit(10),
        supabaseAdmin.from("tasks").select("*").eq("contact_id", contactId).order("due_date", { ascending: false }).limit(10),
        contact.company_id
            ? supabaseAdmin.from("companies").select("*").eq("id", contact.company_id).single()
            : Promise.resolve({ data: null }),
    ]);

    const prompt = `Analyze this CRM contact and provide actionable insights:

CONTACT: ${JSON.stringify(contact, null, 2)}
COMPANY: ${JSON.stringify(company.data, null, 2)}
RECENT NOTES: ${JSON.stringify(notes.data, null, 2)}
TASKS: ${JSON.stringify(tasks.data, null, 2)}

Provide:
1. **Summary** - Brief overview of this contact
2. **Engagement Level** - How engaged is this contact? (based on notes, tasks, last_seen)
3. **Suggested Actions** - 2-3 specific next steps
4. **Risk Factors** - Any concerns (e.g. going cold, overdue tasks)
5. **Talking Points** - For next interaction`;

    return callGemini(prompt, []);
}

// ─── Main Handler ─────────────────────────────────────────────────────

Deno.serve(async (req: Request) =>
    OptionsMiddleware(req, async (req) =>
        AuthMiddleware(req, async (req) =>
            UserMiddleware(req, async (req, user) => {
                const currentUserSale = await getUserSale(user);
                if (!currentUserSale) {
                    return createErrorResponse(401, "Unauthorized");
                }

                const url = new URL(req.url);
                const path = url.pathname.replace(/^\/ai\/?/, "");

                // POST /ai/chat - General AI chat
                if (req.method === "POST" && (path === "chat" || path === "")) {
                    try {
                        const { message, history = [] } = await req.json();
                        if (!message) return createErrorResponse(400, "message is required");

                        const reply = await callGemini(message, history);
                        return createJsonResponse({ reply });
                    } catch (err: any) {
                        console.error("AI chat error:", err);
                        return createErrorResponse(500, err.message || "AI service error");
                    }
                }

                // POST /ai/insights/contact/:id - Contact insights
                if (req.method === "POST" && path.startsWith("insights/contact/")) {
                    try {
                        const contactId = parseInt(path.split("/").pop()!, 10);
                        const insights = await getContactInsights(contactId);
                        return createJsonResponse({ insights });
                    } catch (err: any) {
                        console.error("AI insights error:", err);
                        return createErrorResponse(500, err.message || "AI service error");
                    }
                }

                return createErrorResponse(404, "Not found. Available: POST /ai/chat, POST /ai/insights/contact/:id");
            })
        )
    )
);
