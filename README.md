# Twenty CRM Self-Hosting Deployment

This repository is currently transitioning from a custom React + Supabase implementation to a purely self-hosted, Dockerized instance of **[Twenty CRM](https://twenty.com/)**, conforming to the project PRD requirements.

The previous application source code has been systematically removed.

## Architecture

*   **Application**: Twenty CRM (via Docker Compose)
*   **Database**: PostgreSQL
*   **Message Broker**: Redis
*   **Storage**: MinIO

## Legacy

The `supabase/` directory has been **intentionally preserved** to retain the existing database definitions, migrations, and schema mappings in cloud environments, ensuring no existing client data or schemas are inadvertently lost during the transition to Twenty.
