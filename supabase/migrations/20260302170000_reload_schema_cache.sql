-- Force PostgREST to reload its schema cache
-- This is needed because the configuration table was added but PostgREST
-- didn't refresh its schema cache, causing 406 errors.
NOTIFY pgrst, 'reload schema';
