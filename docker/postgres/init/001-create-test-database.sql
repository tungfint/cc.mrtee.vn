SELECT 'CREATE DATABASE cc_tracker_test OWNER cc_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cc_tracker_test')\gexec
