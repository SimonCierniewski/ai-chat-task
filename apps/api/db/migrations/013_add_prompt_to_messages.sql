-- Add prompt field to messages table to store the full OpenAI prompt
-- This allows admins to see exactly what was sent to the AI

-- Add the prompt column as JSONB to store structured prompt data
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS prompt JSONB;

-- Add comment explaining the field
COMMENT ON COLUMN public.messages.prompt IS 'Full prompt sent to OpenAI (for assistant messages only) - includes system prompt, memory context, and user message';

-- Create an index for faster queries on messages with prompts
CREATE INDEX IF NOT EXISTS idx_messages_has_prompt 
ON public.messages ((prompt IS NOT NULL))
WHERE prompt IS NOT NULL;