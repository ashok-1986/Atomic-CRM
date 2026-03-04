#!/usr/bin/env node

/**
 * Atomic CRM MCP Server
 *
 * Exposes CRM data (contacts, companies, deals, tasks) to AI assistants
 * via the Model Context Protocol. Connects to the REST API gateway
 * using an API key for authentication.
 *
 * Usage:
 *   ATOMIC_CRM_API_KEY=ak_... ATOMIC_CRM_URL=https://... node dist/index.js
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Configuration ────────────────────────────────────────────────────

const API_KEY = process.env.ATOMIC_CRM_API_KEY;
const BASE_URL =
    process.env.ATOMIC_CRM_URL ||
    "https://iqbbxmagceczibmqfnnm.supabase.co/functions/v1/api/v1";

if (!API_KEY) {
    console.error("ERROR: ATOMIC_CRM_API_KEY environment variable is required.");
    console.error(
        "Generate one in the CRM: Settings → API Keys → Generate Key"
    );
    process.exit(1);
}

// ─── API Client ───────────────────────────────────────────────────────

async function apiRequest(
    method: string,
    path: string,
    body?: unknown
): Promise<unknown> {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
        method,
        headers: {
            "X-API-Key": API_KEY!,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const error = await res.text();
        throw new Error(`API ${method} ${path} failed (${res.status}): ${error}`);
    }

    if (res.status === 204) return { success: true };
    return res.json();
}

// ─── MCP Server ───────────────────────────────────────────────────────

const server = new McpServer({
    name: "atomic-crm",
    version: "1.0.0",
});

// ─── Resources ────────────────────────────────────────────────────────

server.resource(
    "contacts-list",
    "crm://contacts",
    async (uri) => {
        const result = (await apiRequest("GET", "/contacts?per_page=100")) as any;
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(result.data, null, 2),
                },
            ],
        };
    }
);

server.resource(
    "companies-list",
    "crm://companies",
    async (uri) => {
        const result = (await apiRequest("GET", "/companies?per_page=100")) as any;
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(result.data, null, 2),
                },
            ],
        };
    }
);

server.resource(
    "deals-list",
    "crm://deals",
    async (uri) => {
        const result = (await apiRequest("GET", "/deals?per_page=100")) as any;
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(result.data, null, 2),
                },
            ],
        };
    }
);

// ─── Tools ────────────────────────────────────────────────────────────

// Search Contacts
server.tool(
    "search_contacts",
    "Search for contacts in the CRM by name, email, or status. Returns matching contacts with their details.",
    {
        query: z
            .string()
            .optional()
            .describe("Search term to match against contact names"),
        status: z
            .string()
            .optional()
            .describe("Filter by status (e.g. 'cold', 'warm', 'hot')"),
        page: z.number().optional().default(1).describe("Page number"),
        per_page: z
            .number()
            .optional()
            .default(25)
            .describe("Results per page (max 100)"),
    },
    async ({ query, status, page, per_page }) => {
        let path = `/contacts?page=${page}&per_page=${per_page}`;
        if (query) path += `&first_name=ilike.%25${query}%25`;
        if (status) path += `&status=eq.${status}`;

        const result = (await apiRequest("GET", path)) as any;
        return {
            content: [
                {
                    type: "text" as const,
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
);

// Get Contact by ID
server.tool(
    "get_contact",
    "Get detailed information about a specific contact by their ID.",
    {
        id: z.number().describe("Contact ID"),
    },
    async ({ id }) => {
        const result = await apiRequest("GET", `/contacts/${id}`);
        return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
    }
);

// Create Contact
server.tool(
    "create_contact",
    "Create a new contact in the CRM. At minimum, provide first_name.",
    {
        first_name: z.string().describe("Contact's first name"),
        last_name: z.string().optional().describe("Contact's last name"),
        title: z.string().optional().describe("Job title"),
        company_id: z.number().optional().describe("Company ID to associate with"),
        status: z
            .string()
            .optional()
            .describe("Contact status (cold, warm, hot, in-contract, etc)"),
        background: z.string().optional().describe("Background notes"),
        linkedin_url: z.string().optional().describe("LinkedIn profile URL"),
    },
    async (data) => {
        const result = await apiRequest("POST", "/contacts", data);
        return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
    }
);

// Update Contact
server.tool(
    "update_contact",
    "Update an existing contact's information.",
    {
        id: z.number().describe("Contact ID to update"),
        first_name: z.string().optional().describe("Updated first name"),
        last_name: z.string().optional().describe("Updated last name"),
        title: z.string().optional().describe("Updated job title"),
        status: z.string().optional().describe("Updated status"),
        background: z.string().optional().describe("Updated background notes"),
    },
    async ({ id, ...data }) => {
        const result = await apiRequest("PATCH", `/contacts/${id}`, data);
        return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
    }
);

// Search Companies
server.tool(
    "search_companies",
    "Search for companies in the CRM by name or sector.",
    {
        query: z.string().optional().describe("Company name search term"),
        sector: z.string().optional().describe("Filter by sector"),
        page: z.number().optional().default(1),
        per_page: z.number().optional().default(25),
    },
    async ({ query, sector, page, per_page }) => {
        let path = `/companies?page=${page}&per_page=${per_page}`;
        if (query) path += `&name=ilike.%25${query}%25`;
        if (sector) path += `&sector=eq.${sector}`;

        const result = await apiRequest("GET", path);
        return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
    }
);

// Search Deals
server.tool(
    "search_deals",
    "Search for deals in the CRM. Filter by stage, category, or company.",
    {
        stage: z
            .string()
            .optional()
            .describe("Deal stage (opportunity, proposal, won, lost, etc)"),
        category: z.string().optional().describe("Deal category"),
        company_id: z.number().optional().describe("Filter by company ID"),
        page: z.number().optional().default(1),
        per_page: z.number().optional().default(25),
    },
    async ({ stage, category, company_id, page, per_page }) => {
        let path = `/deals?page=${page}&per_page=${per_page}`;
        if (stage) path += `&stage=eq.${stage}`;
        if (category) path += `&category=eq.${category}`;
        if (company_id) path += `&company_id=eq.${company_id}`;

        const result = await apiRequest("GET", path);
        return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
    }
);

// Create Deal
server.tool(
    "create_deal",
    "Create a new deal in the CRM pipeline.",
    {
        name: z.string().describe("Deal name/title"),
        stage: z.string().describe("Pipeline stage"),
        amount: z.number().optional().describe("Deal value in currency units"),
        company_id: z.number().optional().describe("Associated company ID"),
        category: z.string().optional().describe("Deal category"),
        description: z.string().optional().describe("Deal description"),
    },
    async (data) => {
        const result = await apiRequest("POST", "/deals", data);
        return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
    }
);

// Add Note to Contact
server.tool(
    "add_contact_note",
    "Add a note to a contact's record.",
    {
        contact_id: z.number().describe("Contact ID to add the note to"),
        text: z.string().describe("Note content (supports markdown)"),
        status: z.string().optional().describe("Note status"),
    },
    async (data) => {
        const result = await apiRequest("POST", "/contact-notes", data);
        return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
    }
);

// Create Task
server.tool(
    "create_task",
    "Create a new task associated with a contact.",
    {
        contact_id: z.number().describe("Contact ID to create the task for"),
        text: z.string().describe("Task description"),
        type: z.string().optional().describe("Task type"),
        due_date: z
            .string()
            .describe("Due date in ISO 8601 format (e.g. 2026-03-15T00:00:00Z)"),
    },
    async (data) => {
        const result = await apiRequest("POST", "/tasks", data);
        return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
    }
);

// Get CRM Summary / Dashboard
server.tool(
    "crm_summary",
    "Get a high-level summary of the CRM: total contacts, companies, deals, and deal pipeline value.",
    {},
    async () => {
        const [contacts, companies, deals] = await Promise.all([
            apiRequest("GET", "/contacts?per_page=1") as Promise<any>,
            apiRequest("GET", "/companies?per_page=1") as Promise<any>,
            apiRequest("GET", "/deals?per_page=100") as Promise<any>,
        ]);

        const totalDealValue = deals.data?.reduce(
            (sum: number, d: any) => sum + (d.amount || 0),
            0
        );

        const stageBreakdown: Record<string, number> = {};
        deals.data?.forEach((d: any) => {
            stageBreakdown[d.stage] = (stageBreakdown[d.stage] || 0) + 1;
        });

        const summary = {
            total_contacts: contacts.meta?.total ?? 0,
            total_companies: companies.meta?.total ?? 0,
            total_deals: deals.meta?.total ?? 0,
            total_pipeline_value: totalDealValue,
            deals_by_stage: stageBreakdown,
        };

        return {
            content: [
                {
                    type: "text" as const,
                    text: JSON.stringify(summary, null, 2),
                },
            ],
        };
    }
);

// ─── Start Server ─────────────────────────────────────────────────────

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Atomic CRM MCP Server running on stdio");
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
