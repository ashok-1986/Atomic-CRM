# Atomic CRM MCP Server

Exposes your CRM data to AI assistants (Claude, Gemini, etc.) via the [Model Context Protocol](https://modelcontextprotocol.io).

## Setup

```bash
cd mcp-server
npm install
npm run build
```

## Configure Your AI Assistant

### Claude Desktop / Cline

Add to your MCP settings JSON:

```json
{
  "mcpServers": {
    "atomic-crm": {
      "command": "node",
      "args": ["D:/Projects/Business/Atomic CRM/mcp-server/dist/index.js"],
      "env": {
        "ATOMIC_CRM_API_KEY": "ak_your_key_here"
      }
    }
  }
}
```

### Antigravity (Gemini)

Add to `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "atomic-crm": {
      "command": "node",
      "args": ["D:/Projects/Business/Atomic CRM/mcp-server/dist/index.js"],
      "env": {
        "ATOMIC_CRM_API_KEY": "ak_your_key_here"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search_contacts` | Search contacts by name or status |
| `get_contact` | Get a contact by ID |
| `create_contact` | Create a new contact |
| `update_contact` | Update a contact's details |
| `search_companies` | Search companies by name or sector |
| `search_deals` | Search deals by stage/category/company |
| `create_deal` | Create a new deal |
| `add_contact_note` | Add a note to a contact |
| `create_task` | Create a task for a contact |
| `crm_summary` | Get CRM dashboard summary |

## Available Resources

| Resource | URI |
|----------|-----|
| All Contacts | `crm://contacts` |
| All Companies | `crm://companies` |
| All Deals | `crm://deals` |

## Generate an API Key

1. Log into the CRM as an admin
2. Go to **Settings → API Keys**
3. Click **Generate Key**
4. Copy the key and set it as `ATOMIC_CRM_API_KEY`
