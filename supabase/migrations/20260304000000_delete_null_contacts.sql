-- Delete all contacts with null first_name (bad import data)
-- Also clean up any related records
DELETE FROM contact_notes WHERE contact_id IN (
    SELECT id FROM contacts WHERE first_name IS NULL
);

DELETE FROM tasks WHERE contact_id IN (
    SELECT id FROM contacts WHERE first_name IS NULL
);

DELETE FROM contacts WHERE first_name IS NULL;
