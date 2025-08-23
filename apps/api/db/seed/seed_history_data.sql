-- Seed data for testing History tab
-- This creates sample data in memory_context and messages tables

-- First, insert a test user in memory_context with the admin as owner
-- Replace 'ADMIN_USER_ID' with your actual admin user ID from auth.users table
-- Replace 'TEST_USER_ID' with a test user ID

-- Example: Get your admin user ID first
-- SELECT id, email FROM auth.users WHERE email = 'your-admin-email@example.com';

-- Insert sample memory_context record
INSERT INTO public.memory_context (user_id, owner_id, name, context_block, metadata)
VALUES 
  ('11111111-1111-1111-1111-111111111111'::uuid, 'ADMIN_USER_ID'::uuid, 'John Doe', 'Sample context block', '{"tokens": 150}'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'ADMIN_USER_ID'::uuid, 'Jane Smith', 'Another context block', '{"tokens": 200}')
ON CONFLICT (user_id) DO UPDATE SET 
  owner_id = EXCLUDED.owner_id,
  name = EXCLUDED.name;

-- Insert sample messages for these users
INSERT INTO public.messages (id, thread_id, role, content, created_at, user_id, start_ms, ttft_ms, total_ms, tokens_in, tokens_out, price, model)
VALUES
  -- John Doe's messages
  (gen_random_uuid(), 'session-001', 'user', 'Hello, how are you?', NOW() - INTERVAL '2 hours', '11111111-1111-1111-1111-111111111111'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (gen_random_uuid(), 'session-001', 'assistant', 'I am doing well, thank you!', NOW() - INTERVAL '2 hours', '11111111-1111-1111-1111-111111111111'::uuid, 1704067200000, 350, 1200, 25, 30, 0.000875, 'gpt-4'),
  (gen_random_uuid(), 'session-001', 'memory', 'Retrieved context about user preferences', NOW() - INTERVAL '2 hours', '11111111-1111-1111-1111-111111111111'::uuid, 1704067180000, NULL, 150, NULL, NULL, NULL, NULL),
  (gen_random_uuid(), 'session-001', 'user', 'Can you help me with a task?', NOW() - INTERVAL '1 hour', '11111111-1111-1111-1111-111111111111'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (gen_random_uuid(), 'session-001', 'assistant', 'Of course! I would be happy to help.', NOW() - INTERVAL '1 hour', '11111111-1111-1111-1111-111111111111'::uuid, 1704070800000, 280, 980, 28, 35, 0.000945, 'gpt-4'),
  
  -- Jane Smith's messages
  (gen_random_uuid(), 'session-002', 'user', 'What is the weather today?', NOW() - INTERVAL '3 hours', '22222222-2222-2222-2222-222222222222'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (gen_random_uuid(), 'session-002', 'assistant', 'I cannot check real-time weather, but you can check weather.com', NOW() - INTERVAL '3 hours', '22222222-2222-2222-2222-222222222222'::uuid, 1704063600000, 420, 1500, 30, 45, 0.001125, 'gpt-3.5-turbo'),
  (gen_random_uuid(), 'session-002', 'memory', 'Retrieved location context', NOW() - INTERVAL '3 hours', '22222222-2222-2222-2222-222222222222'::uuid, 1704063580000, NULL, 180, NULL, NULL, NULL, NULL),
  (gen_random_uuid(), 'session-002', 'user', 'Thank you for the information', NOW() - INTERVAL '2.5 hours', '22222222-2222-2222-2222-222222222222'::uuid, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (gen_random_uuid(), 'session-002', 'assistant', 'You are welcome! Let me know if you need anything else.', NOW() - INTERVAL '2.5 hours', '22222222-2222-2222-2222-222222222222'::uuid, 1704065400000, 300, 1100, 35, 40, 0.001125, 'gpt-3.5-turbo');

-- Note: After running this script, update 'ADMIN_USER_ID' with your actual admin user ID
-- You can find it by running: SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';