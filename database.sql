-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TRANSCRIPTS TABLE
-- This table stores the primary record for each orchestration task.
-- The transcript text is the core trigger for all subsequent actions.
CREATE TABLE public.transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    project_title TEXT NOT NULL,
    audio_url TEXT, -- URL to the source audio file, if available
    transcript_text TEXT NOT NULL,
    full_audio BYTEA -- For storing the actual audio file if uploaded directly
);

COMMENT ON TABLE public.transcripts IS 'Stores the core transcription data and project details.';
COMMENT ON COLUMN public.transcripts.transcript_text IS 'The multi-speaker transcript that triggers orchestration.';

-- 2. ANALYZERS TABLE
-- Stores the dynamically generated analyzers from the orchestrator.
-- Each analyzer has a specific name and a prompt that was used to generate its result.
CREATE TABLE public.analyzers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transcript_id UUID NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    analyzer_name TEXT NOT NULL,
    analyzer_prompt TEXT NOT NULL,
    analyzer_result JSONB -- Stores the output from the standalone chat completion
);

COMMENT ON TABLE public.analyzers IS 'Stores dynamic analyzers created by the orchestrator for a given transcript.';
COMMENT ON COLUMN public.analyzers.analyzer_prompt IS 'The exact prompt given to the AI model for this analysis.';
COMMENT ON COLUMN public.analyzers.analyzer_result IS 'The JSON response from the AI model.';


-- 3. HISTORY TABLE
-- Logs major events for a given project/transcript for auditing and display.
CREATE TABLE public.history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transcript_id UUID NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    event_type TEXT NOT NULL, -- e.g., 'ORCHESTRATION_START', 'ANALYZER_CREATED'
    details JSONB -- Additional details about the event
);

COMMENT ON TABLE public.history IS 'A log of all conversations and events related to a transcript.';


-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- Essential for a production environment to ensure users can only access their own data.
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow users to manage their own transcripts" ON public.transcripts
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.analyzers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow users to manage their own analyzers" ON public.analyzers
    FOR ALL USING (auth.uid() = (SELECT user_id FROM public.transcripts WHERE id = transcript_id));

ALTER TABLE public.history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow users to view their own history" ON public.history
    FOR ALL USING (auth.uid() = (SELECT user_id FROM public.transcripts WHERE id = transcript_id));

-- 5. STORAGE BUCKET for audio files
-- insert into storage.buckets (id, name) values ('audio_files', 'audio_files');
-- CREATE POLICY "Give users access to own audio files" ON storage.objects FOR ALL
--   USING ( bucket_id = 'audio_files' AND auth.uid() = owner )
--   WITH CHECK ( bucket_id = 'audio_files' AND auth.uid() = owner );

