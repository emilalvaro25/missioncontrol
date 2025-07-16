document.addEventListener('DOMContentLoaded', () => {
    // --- IMPORTANT: CONFIGURE YOUR SUPABASE CLIENT ---
    // You must replace these with your actual Supabase project credentials.
    // In a production app, load these from environment variables, not hardcoded.
    const SUPABASE_URL = ''; // e.g., 'https://xyz.supabase.co'
    const SUPABASE_ANON_KEY = ''; // e.g., 'ey...'

    // --- Page Setup ---
    const pageId = document.body.id;
    let supabase = null;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        document.body.innerHTML = `<div style="padding: 2rem; color: #f87171;"><h1>Configuration Error</h1><p>Supabase URL and Key are missing. Please add them to the top of <code>/assets/js/app.js</code>.</p></div>`;
        return;
    }

    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- Initialize Page-Specific Logic ---
    if (pageId === 'page-transcription') {
        initTranscriptionPage(supabase);
    } else if (pageId === 'page-analyzers') {
        initAnalyzersPage(supabase);
    } else if (pageId === 'page-history') {
        initHistoryPage(supabase);
    }

    // --- Register Service Worker for PWA ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.error('Service Worker registration failed:', err);
        });
    }
});


/**
 * Initializes the main transcription page logic.
 * @param {SupabaseClient} supabase The Supabase client instance.
 */
function initTranscriptionPage(supabase) {
    const projectTitleInput = document.getElementById('project-title');
    const transcriptInput = document.getElementById('transcript-input');
    const orchestrateBtn = document.getElementById('orchestrate-btn');
    const statusConsole = document.getElementById('status-console');

    // When text is pasted or typed, this is the trigger
    transcriptInput.addEventListener('input', () => {
        const hasText = transcriptInput.value.trim().length > 0;
        orchestrateBtn.disabled = !hasText;
    });

    orchestrateBtn.addEventListener('click', async () => {
        const transcriptText = transcriptInput.value.trim();
        const projectTitle = projectTitleInput.value.trim() || 'Untitled Project';

        if (!transcriptText) return;

        orchestrateBtn.disabled = true;
        statusConsole.textContent = `[${new Date().toLocaleTimeString()}] Orchestration triggered for "${projectTitle}"...\n`;
        statusConsole.textContent += `[${new Date().toLocaleTimeString()}] Saving transcript to Supabase...\n`;

        // Step 1: Save the initial transcript to the database
        const { data: transcriptData, error: transcriptError } = await supabase
            .from('transcripts')
            .insert({
                project_title: projectTitle,
                transcript_text: transcriptText,
                // In a real app with auth: user_id: supabase.auth.user()?.id
            })
            .select()
            .single();

        if (transcriptError) {
            statusConsole.textContent += `[${new Date().toLocaleTimeString()}] Error: ${transcriptError.message}\n`;
            orchestrateBtn.disabled = false;
            return;
        }

        statusConsole.textContent += `[${new Date().toLocaleTimeString()}] Transcript saved with ID: ${transcriptData.id}\n`;
        statusConsole.textContent += `[${new Date().toLocaleTimeString()}] Starting Orchestrator AI... (Simulating)\n`;

        // --- ORCHESTRATOR LOGIC (SIMULATED) ---
        // In a real scenario, you would make an API call here to your backend,
        // which then calls the Gemini model with a prompt to generate the analyzers.
        // The orchestrator's prompt would be something like:
        // "Based on the following transcript, generate a list of 3-5 relevant analysis tasks.
        // For each task, provide a 'name' and a 'prompt' for another AI to execute.
        // Return this as a JSON array [{name, prompt}, ...]. Transcript: ${transcriptText}"

        // We will simulate the output of this call.
        const simulatedAnalyzers = [
            { name: "Summarization", prompt: `Summarize this transcript: ${transcriptText}` },
            { name: "Action Items", prompt: `List all action items from this transcript: ${transcriptText}` },
            { name: "Sentiment Analysis", prompt: `Analyze the overall sentiment of this transcript: ${transcriptText}` }
        ];

        statusConsole.textContent += `[${new Date().toLocaleTimeString()}] Orchestrator identified ${simulatedAnalyzers.length} analyzers to run.\n`;

        // Step 2: Save the generated analyzers to the database
        const analyzersToInsert = simulatedAnalyzers.map(analyzer => ({
            transcript_id: transcriptData.id,
            analyzer_name: analyzer.name,
            analyzer_prompt: analyzer.prompt
        }));

        const { error: analyzerError } = await supabase
            .from('analyzers')
            .insert(analyzersToInsert);

        if (analyzerError) {
            statusConsole.textContent += `[${new Date().toLocaleTimeString()}] Error saving analyzers: ${analyzerError.message}\n`;
        } else {
            statusConsole.textContent += `[${new Date().toLocaleTimeString()}] Analyzers saved successfully.\n`;
        }

        statusConsole.textContent += `[${new Date().toLocaleTimeString()}] Orchestration complete. You can view results on the Analyzers page.\n`;
        orchestrateBtn.disabled = false;
    });
}

/**
 * Initializes the Analyzers page to display generated analysis tasks.
 * @param {SupabaseClient} supabase The Supabase client instance.
 */
async function initAnalyzersPage(supabase) {
    const listContainer = document.getElementById('analyzers-list');
    listContainer.innerHTML = '<p>Loading analyzers...</p>';

    // Fetch transcripts and their associated analyzers
    const { data, error } = await supabase
        .from('transcripts')
        .select('id, created_at, project_title, analyzers ( id, analyzer_name, analyzer_prompt )')
        .order('created_at', { ascending: false });

    if (error) {
        listContainer.innerHTML = `<p style="color:#f87171;">Error fetching data: ${error.message}</p>`;
        return;
    }

    if (!data.length) {
        listContainer.innerHTML = '<p>No analyzers found. Go to the Transcription page to start an orchestration.</p>';
        return;
    }

    listContainer.innerHTML = '';
    data.forEach(transcript => {
        const item = document.createElement('div');
        item.className = 'list-item';

        let analyzersHtml = '<ul>';
        if (transcript.analyzers.length > 0) {
            transcript.analyzers.forEach(analyzer => {
                analyzersHtml += `<li><strong>${analyzer.analyzer_name}:</strong> <pre><code>${analyzer.analyzer_prompt.substring(0, 100)}...</code></pre></li>`;
            });
        } else {
            analyzersHtml += '<li>No analyzers generated for this transcript yet.</li>';
        }
        analyzersHtml += '</ul>';

        item.innerHTML = `
            <h3>${transcript.project_title}</h3>
            <p>Created on ${new Date(transcript.created_at).toLocaleString()}</p>
            ${analyzersHtml}
        `;
        listContainer.appendChild(item);
    });
}

/**
 * Initializes the History page to show past projects.
 * @param {SupabaseClient} supabase The Supabase client instance.
 */
async function initHistoryPage(supabase) {
    const listContainer = document.getElementById('history-list');
    listContainer.innerHTML = '<p>Loading history...</p>';

    const { data, error } = await supabase
        .from('transcripts')
        .select('id, created_at, project_title, transcript_text')
        .order('created_at', { ascending: false });

    if (error) {
        listContainer.innerHTML = `<p style="color:#f87171;">Error fetching history: ${error.message}</p>`;
        return;
    }

    if (!data.length) {
        listContainer.innerHTML = '<p>No project history found.</p>';
        return;
    }

    listContainer.innerHTML = '';
    data.forEach(transcript => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <h3>${transcript.project_title}</h3>
            <p>Created on ${new Date(transcript.created_at).toLocaleString()}</p>
            <p><strong>Transcript Preview:</strong> <code>${transcript.transcript_text.substring(0, 200)}...</code></p>
        `;
        listContainer.appendChild(item);
    });
}
