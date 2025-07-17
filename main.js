        const firebaseConfig = {
            apiKey: "AIzaSyBe9a58zaQCrBSGeWwcIVa_PnZABoH6zV4",
            authDomain: "tudds-ccd0wn.firebaseapp.com",
            databaseURL: "https://tudds-ccd0wn-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "tudds-ccd0wn",
            storageBucket: "tudds-ccd0wn.appspot.com",
            messagingSenderId: "786974954352",
            appId: "1:786974954352:web:5f933f5a2f9f386d9bb5b5"
        };
        firebase.initializeApp(firebaseConfig);
        const database = firebase.database();
        
        const DEEPGRAM_API_KEY = "12fdbd313fcd46a0f9b179c82172075931771a6d";
        const SPEAKER_MAP = ['Alex Dev', 'Sarah Project', 'Master E', 'Jordan QA'];

        const AI_TASK_CONFIG = {
            orchestrator: { model: 'gemini-1.5-flash-latest', apiKey: 'AIzaSyDmDy63i4GM51UslGv22EK2Zr3cgYIhynQ' },
            analyzer: { model: 'gemini-1.5-flash-latest', apiKey: 'AIzaSyAM7cBZFa2cGcR_jSanglmj85xUfagHj8g' },
            mission_executive: { model: 'gemini-1.5-flash-latest', apiKey: 'AIzaSyCZgUiSfqM0A_aEKcMy6L3n4m8xCnGPuXs' },
            lead_developer: { model: 'gemini-1.5-flash-latest', apiKey: 'AIzaSyA6pvm1LTtHMC3-R8wKCFzCMwUgX54CcPA' }
        };

        const ORCHESTRATOR_SYSTEM_PROMPT_AUTO = `You are the master Orchestrator AI. Your input is a raw transcript.
        Your tasks are:
        1. Classify the transcript into a single, relevant project type.
        2. Analyze the transcript and dynamically generate a set of specific analyzer tasks needed to deconstruct the project. You must generate a MINIMUM of 4 distinct analyzers.
        3. Provide a brief, high-level analysis of the transcript.
        Your final output MUST be a single, valid JSON object with three keys: "project_type", "analysis", and "required_analyzers" (an OBJECT where each key is a unique ID and each value is an OBJECT with "title" and "prompt" keys).`;
        
        const ORCHESTRATOR_SYSTEM_PROMPT_MANUAL = `You are the master Orchestrator AI. The user has specified the project type. Your input is a raw transcript and this project type.
        Your tasks are:
        1. Analyze the transcript and dynamically generate a set of specific analyzer tasks relevant to the provided project type. You must generate a MINIMUM of 4 distinct analyzers.
        2. Provide a brief, high-level analysis of the transcript within the context of the given project type.
        Your final output MUST be a single, valid JSON object with two keys: "analysis" and "required_analyzers" (an OBJECT where each key is a unique ID and each value is an OBJECT with "title" and "prompt" keys).`;

        const MISSION_EXECUTIVE_SYSTEM_PROMPT = `You are the Mission Executive, a C-level strategist AI. Your input is a transcript, a project type, and the collected outputs from multiple, specialized analyzers. Synthesize ALL information into a single, cohesive executive briefing. This is the master document that will guide the project. Structure your response with clear, bold markdown headings like '**Overall Project Vision**', '**Key Strategic Pillars**', and '**Final Recommendations**'.`;
        const LEAD_DEVELOPER_SYSTEM_PROMPT = `You are the Lead Developer Agent AI. Your input is the Mission Executive's final synthesized briefing. Your task is to carefully identify all necessary App and Web pages for the project. For each page, create a dedicated DevOps Agent system prompt to generate a detailed page specification. Output a JSON object with two keys: "pages" (an array of page names) and "devops_prompts" (an object where each key is a page name and the value is the system prompt string for its DevOps Agent).`;
        
        let appState = {
            meetingId: null, analyzerQueue: {}, analysisResults: {}, projectType: null, missionExecutiveText: '', leadDeveloperText: '', 
            lastCheckedSupabaseUrl: null, hourlyScanIntervalId: null
        };
        const selectors = {
            runOrchestrationBtn: document.getElementById('runOrchestrationBtn'),
            orchestrationLoader: document.getElementById('orchestration-loader'),
            transcriptionLoader: document.getElementById('transcription-loader'),
            transcriptOutputText: document.getElementById('transcript-output-text'),
            aiControlsContainer: document.getElementById('ai-controls-container'),
            autoAnalyzeToggle: document.getElementById('auto-analyze-toggle'),
            orchestratorContainer: document.getElementById('orchestrator-container'),
            orchestratorTextEl: document.querySelector('#orchestrator-console .console-text'),
            analyzerContainer: document.getElementById('analyzer-consoles-container'),
            missionExecutiveContainer: document.getElementById('mission-executive-container'),
            missionExecutiveTextEl: document.querySelector('#mission-executive-console .console-text'),
            copyMissionExecutiveBtn: document.getElementById('copyMissionExecutiveBtn'),
            leadDeveloperContainer: document.getElementById('lead-developer-container'),
            leadDeveloperTextEl: document.querySelector('#lead-developer-console .console-text'),
            copyLeadDevBtn: document.getElementById('copyLeadDevBtn'),
            autoLeadDevRunToggle: document.getElementById('auto-leaddev-run-toggle'),
            nextStepContainer: document.getElementById('next-step-container'),
            supabaseUrlInput: document.getElementById('supabase-url-input'),
            keepUrlDefaultToggle: document.getElementById('keep-url-default-toggle'),
            scanStatus: document.getElementById('scan-status'),
            manualUrlInput: document.getElementById('manual-url-input'),
            manualTranscribeBtn: document.getElementById('manual-transcribe-btn'),
            projectTypeSelect: document.getElementById('project-type-select'),
        };

        const sleep = ms => new Promise(res => setTimeout(res, ms));
        async function typeText(element, text, speed = 1) {
            element.innerHTML = '';
            const sanitizedText = text || '';
            let markdownBuffer = '';
            const md = window.markdownit({ html: true, linkify: true, typographer: true });
            for (const char of sanitizedText) {
                markdownBuffer += char;
                element.innerHTML = md.render(markdownBuffer);
                element.closest('.console-box').scrollTop = element.closest('.console-box').scrollHeight;
                await sleep(speed);
            }
        }
        function extractJson(text) {
            const match = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
            try {
                if (match && match[1]) return JSON.parse(match[1]);
                const plainMatch = text.match(/\{[\s\S]*\}/);
                return plainMatch ? JSON.parse(plainMatch[0]) : null;
            } catch (e) { console.error("JSON parsing error:", e, text); return null; }
        }
        function setDbData(path, data) { firebase.database().ref(path).set(data).catch(e => console.error("Firebase write failed:", e)); }
        function formatDeepgramResponse(data) {
            const utterances = data.results?.utterances;
            if (!utterances || utterances.length === 0) return 'Transcription failed or no speech detected.';
            return utterances.map(u => `<strong>${SPEAKER_MAP[u.speaker] || `Speaker ${u.speaker + 1}`}:</strong> ${u.transcript}`).join('<br><br>');
        }
        
        async function callGemini(taskType, conversationHistory) {
            const config = AI_TASK_CONFIG[taskType];
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
            const MAX_RETRIES = 3, INITIAL_BACKOFF_MS = 2000;
            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                try {
                    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: conversationHistory }) });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0]) return data.candidates[0].content.parts[0].text;
                        if (data.candidates && data.candidates[0].finishReason) throw new Error(`AI task '${taskType}' finished prematurely. Reason: ${data.candidates[0].finishReason}.`);
                        throw new Error(`Invalid API response structure for ${taskType}.`);
                    }
                    if (response.status === 429) {
                        const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 1000;
                        console.warn(`Rate limit hit for ${taskType}. Retrying in ${Math.round(delay/1000)}s...`);
                        await sleep(delay); continue;
                    }
                    const errorBody = await response.text();
                    throw new Error(`API Error for ${taskType}: ${response.status} ${response.statusText} - ${errorBody}`);
                } catch (error) { if (attempt === MAX_RETRIES - 1) throw error; }
            }
            throw new Error(`AI task '${taskType}' failed after ${MAX_RETRIES} attempts.`);
        }

        async function transcribeAndDisplay(url) {
            if (!url) {
                alert("Please provide a valid URL to transcribe.");
                return;
            }
            selectors.transcriptionLoader.classList.remove('hidden');
            selectors.manualTranscribeBtn.disabled = true;
            try {
                const deepgramUrl = 'https://api.deepgram.com/v1/listen?model=nova-2&diarize=true&smart_format=true&utterances=true';
                const headers = { 'Authorization': `Token ${DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' };
                const body = JSON.stringify({ url });
                const dgResponse = await fetch(deepgramUrl, { method: 'POST', headers, body });
                if (!dgResponse.ok) {
                    const error = await dgResponse.json();
                    throw new Error(error.reason || error.err_msg || 'Deepgram API Error');
                }
                const dgData = await dgResponse.json();
                const transcript = formatDeepgramResponse(dgData);
                selectors.transcriptOutputText.innerHTML = transcript;
                updateOrchestrateButtonState();
            } catch (error) {
                console.error("Transcription Error:", error);
                selectors.transcriptOutputText.innerHTML = `<p class="text-red-400"><strong>Transcription Failed:</strong><br>${error.message}</p>`;
            } finally {
                selectors.transcriptionLoader.classList.add('hidden');
                selectors.manualTranscribeBtn.disabled = false;
            }
        }

        async function startOrchestration() {
            selectors.runOrchestrationBtn.classList.add('hidden');
            selectors.orchestrationLoader.classList.remove('hidden');
            selectors.orchestratorContainer.classList.remove('hidden');
            
            // Reset downstream UI elements in case of re-run
            selectors.aiControlsContainer.classList.add('hidden');
            selectors.analyzerContainer.innerHTML = '';
            selectors.missionExecutiveContainer.classList.add('hidden');
            selectors.leadDeveloperContainer.classList.add('hidden');
            selectors.nextStepContainer.classList.add('hidden');
            
            try {
                const rawTextTranscript = selectors.transcriptOutputText.innerText;
                if (!rawTextTranscript.trim()) throw new Error("Transcription output is empty.");

                appState.meetingId = `meeting_${Date.now()}`;
                setDbData(`meetings/${appState.meetingId}/transcript`, rawTextTranscript);
                
                await typeText(selectors.orchestratorTextEl, 'Contacting Orchestrator AI...', 10);
                
                let orchPrompt, responseData;
                const selectedProjectType = selectors.projectTypeSelect.value;
                
                if(!selectedProjectType) {
                    orchPrompt = `${ORCHESTRATOR_SYSTEM_PROMPT_AUTO}\n\nTranscript:\n${rawTextTranscript}`;
                    const orchResponseText = await callGemini('orchestrator', [{ role: 'user', parts: [{ text: orchPrompt }] }]);
                    responseData = extractJson(orchResponseText);
                    if (!responseData || !responseData.project_type) throw new Error("Orchestrator (Auto) returned invalid JSON.");
                    appState.projectType = responseData.project_type;
                    selectors.projectTypeSelect.value = appState.projectType; // Update UI with AI choice
                } else {
                    appState.projectType = selectedProjectType;
                    orchPrompt = `${ORCHESTRATOR_SYSTEM_PROMPT_MANUAL}\n\nProject Type: ${appState.projectType}\n\nTranscript:\n${rawTextTranscript}`;
                    const orchResponseText = await callGemini('orchestrator', [{ role: 'user', parts: [{ text: orchPrompt }] }]);
                    responseData = extractJson(orchResponseText);
                    if (!responseData) throw new Error("Orchestrator (Manual) returned invalid JSON.");
                }

                setDbData(`meetings/${appState.meetingId}/orchestrator`, responseData);
                await typeText(selectors.orchestratorTextEl, responseData.analysis, 5);
                document.querySelector('#orchestrator-console .blinking-cursor').style.display = 'none';
                appState.analyzerQueue = responseData.required_analyzers;
                
                displayAnalyzers();
                selectors.aiControlsContainer.classList.remove('hidden');
                if (selectors.autoAnalyzeToggle.checked) await runAllAnalyzers();

            } catch (error) {
                handleWorkflowError("Orchestration", selectors.orchestratorTextEl, error);
                selectors.runOrchestrationBtn.classList.remove('hidden');
                selectors.orchestrationLoader.classList.add('hidden');
            }
        }
        
        function displayAnalyzers() {
            selectors.analyzerContainer.innerHTML = '';
            for (const key in appState.analyzerQueue) {
                const analyzer = appState.analyzerQueue[key];
                const cardHTML = `<div class="card p-5 space-y-4" id="analyzer-card-${key}">
                    <div class="flex justify-between items-center"><h3 class="text-base font-semibold text-white">${analyzer.title}</h3>
                    <button class="btn-secondary run-analyzer-btn" data-key="${key}" ${selectors.autoAnalyzeToggle.checked ? 'hidden' : ''} type="button">Run</button></div>
                    <div class="analyzer-output-console console-box hidden" role="region"><span class="console-text"></span><span class="blinking-cursor">|</span></div></div>`;
                selectors.analyzerContainer.insertAdjacentHTML('beforeend', cardHTML);
            }
            document.querySelectorAll('.run-analyzer-btn').forEach(btn => btn.addEventListener('click', (e) => runSingleAnalyzer(e.target.dataset.key)));
        }

        async function runSingleAnalyzer(key, isAuto = false) {
            if (!key || (appState.analysisResults[key] && appState.analysisResults[key].analysis)) return;
            const card = document.getElementById(`analyzer-card-${key}`);
            const btn = card.querySelector('.run-analyzer-btn');
            const outputConsole = card.querySelector('.analyzer-output-console');
            const outputText = outputConsole.querySelector('.console-text');
            if (btn) btn.disabled = true;
            outputConsole.classList.remove('hidden');
            try {
                const analyzerTask = appState.analyzerQueue[key];
                await typeText(outputText, `Contacting ${analyzerTask.title}...`, 10);
                const analyzerPrompt = analyzerTask.prompt + "\n\nReference Transcript:\n" + selectors.transcriptOutputText.innerText;
                const analysisText = await callGemini('analyzer', [{ role: 'user', parts: [{ text: analyzerPrompt }] }]);
                appState.analysisResults[key] = { title: analyzerTask.title, analysis: analysisText };
                setDbData(`meetings/${appState.meetingId}/analyses/${key}`, appState.analysisResults[key]);
                await typeText(outputText, analysisText, 5);
                outputConsole.querySelector('.blinking-cursor').style.display = 'none';
                if (isAuto && Object.keys(appState.analysisResults).length === Object.keys(appState.analyzerQueue).length) await runMissionExecutive();
            } catch (error) {
                handleWorkflowError(`Analyzer (${key})`, outputText, error);
                if (btn) btn.disabled = false;
            }
        }
        
        async function runAllAnalyzers() {
            for (const key in appState.analyzerQueue) await runSingleAnalyzer(key, true);
        }

        async function runMissionExecutive() {
            selectors.missionExecutiveContainer.classList.remove('hidden');
            try {
                await typeText(selectors.missionExecutiveTextEl, 'Consolidating analyses for Mission Executive...', 10);
                const combinedAnalyses = Object.entries(appState.analysisResults).map(([key, result]) => `--- ANALYSIS FROM: ${result.title} ---\n${result.analysis}`).join('\n\n');
                const prompt = `${MISSION_EXECUTIVE_SYSTEM_PROMPT}\n\n--- ORIGINAL TRANSCRIPT ---\n${selectors.transcriptOutputText.innerText}\n\n--- PROJECT TYPE ---\n${appState.projectType}\n\n${combinedAnalyses}`;
                const summaryText = await callGemini('mission_executive', [{ role: 'user', parts: [{ text: prompt }] }]);
                appState.missionExecutiveText = summaryText;
                setDbData(`meetings/${appState.meetingId}/missionExecutive`, { summary: summaryText });
                await typeText(selectors.missionExecutiveTextEl, summaryText, 5);
                selectors.missionExecutiveContainer.querySelector('.blinking-cursor').style.display = 'none';
                if (selectors.autoLeadDevRunToggle.checked) await runLeadDeveloperAgent(summaryText);
            } catch (error) {
                handleWorkflowError("Mission Executive", selectors.missionExecutiveTextEl, error);
            }
        }

        async function runLeadDeveloperAgent(missionExecutiveSummary) {
            selectors.leadDeveloperContainer.classList.remove('hidden');
            try {
                await typeText(selectors.leadDeveloperTextEl, 'Contacting Lead Developer AI...', 10);
                const prompt = `${LEAD_DEVELOPER_SYSTEM_PROMPT}\n\nMission Executive Summary:\n${missionExecutiveSummary}`;
                const responseText = await callGemini('lead_developer', [{ role: 'user', parts: [{ text: prompt }] }]);
                const responseData = extractJson(responseText);
                if (!responseData) throw new Error("Lead Developer agent returned invalid JSON.");
                appState.leadDeveloperText = JSON.stringify(responseData, null, 2);
                setDbData(`meetings/${appState.meetingId}/leadDeveloper`, { response: responseData });
                await typeText(selectors.leadDeveloperTextEl, "```json\n" + appState.leadDeveloperText + "\n```", 5);
                selectors.leadDeveloperContainer.querySelector('.blinking-cursor').style.display = 'none';
                selectors.nextStepContainer.classList.remove('hidden');
            } catch (error) { handleWorkflowError("Lead Developer Agent", selectors.leadDeveloperTextEl, error); }
        }
        
        async function checkSupabaseUrlForTranscription() {
            const currentUrl = selectors.supabaseUrlInput.value.trim();
            const now = new Date();
            const timeString = now.toLocaleTimeString();

            if (!currentUrl) {
                selectors.scanStatus.textContent = `Auto-scan active. No URL provided. Checked at ${timeString}.`;
                return;
            }
            
            selectors.scanStatus.textContent = `Scanning... Last checked at ${timeString}.`;
            
            if (currentUrl !== appState.lastCheckedSupabaseUrl) {
                selectors.scanStatus.textContent = `New URL detected. Transcribing...`;
                await transcribeAndDisplay(currentUrl);
                appState.lastCheckedSupabaseUrl = currentUrl;
                selectors.scanStatus.textContent = `Transcription complete. Last checked at ${new Date().toLocaleTimeString()}`;
            } else {
                 selectors.scanStatus.textContent = `URL unchanged. Scan complete at ${new Date().toLocaleTimeString()}.`;
            }
        }

        function handleWorkflowError(stage, element, error) {
            console.error(`${stage} Error:`, error);
            const errorElement = element.querySelector('.console-text') || element;
            const errorMessage = `Error: ${stage} failed.\n${error.message}`;
            typeText(errorElement, errorMessage, 10).catch(console.error);
        }

        function updateOrchestrateButtonState() {
            const hasText = selectors.transcriptOutputText.innerText.trim().length > 0;
            selectors.runOrchestrationBtn.disabled = !hasText;
        }

        function copyToClipboard(text, button) {
            if (!navigator.clipboard) return alert('Clipboard API not supported');
            const originalIcon = button.innerHTML;
            navigator.clipboard.writeText(text).then(() => {
                button.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => { button.innerHTML = originalIcon; }, 2000);
            }).catch(() => alert('Failed to copy to clipboard.'));
        }

        function setupPage() {
            const glitterBg = document.getElementById('glitter-bg');
            for (let i = 0; i < 50; i++) {
                const glitter = document.createElement('div');
                glitter.className = 'glitter';
                glitter.style.left = `${Math.random() * 100}vw`;
                glitter.style.animationDuration = `${2 + Math.random() * 3}s`;
                glitter.style.animationDelay = `${Math.random() * 5}s`;
                glitterBg.appendChild(glitter);
            }
            // markdown-it is now loaded globally from markdown-it.min.js
            
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.querySelector('.main-content');
            document.getElementById('mobile-menu-btn').addEventListener('click', () => {
                sidebar.classList.toggle('-translate-x-full');
                mainContent.classList.toggle('ml-56');
            });
            
            selectors.keepUrlDefaultToggle.addEventListener('change', (e) => {
                if(e.target.checked) {
                    appState.lastCheckedSupabaseUrl = null; // Reset to force check on first run
                    checkSupabaseUrlForTranscription(); // Run once immediately
                    appState.hourlyScanIntervalId = setInterval(checkSupabaseUrlForTranscription, 3600 * 1000);
                    selectors.supabaseUrlInput.disabled = false;
                } else {
                    if (appState.hourlyScanIntervalId) clearInterval(appState.hourlyScanIntervalId);
                    appState.hourlyScanIntervalId = null;
                    selectors.scanStatus.textContent = `Auto-scan disabled. Last checked: ${appState.lastCheckedSupabaseUrl ? 'previously' : 'Never'}.`;
                }
            });
            
            selectors.manualTranscribeBtn.addEventListener('click', () => {
                transcribeAndDisplay(selectors.manualUrlInput.value.trim());
            });
            
            selectors.transcriptOutputText.addEventListener('input', updateOrchestrateButtonState);
            
            selectors.runOrchestrationBtn.addEventListener('click', startOrchestration);
            
            selectors.autoAnalyzeToggle.addEventListener('change', (e) => {
                document.querySelectorAll('.run-analyzer-btn').forEach(btn => btn.classList.toggle('hidden', e.target.checked));
                if (e.target.checked && Object.keys(appState.analyzerQueue).length > 0) runAllAnalyzers();
            });
            selectors.autoLeadDevRunToggle.addEventListener('change', (e) => {
                if (e.target.checked && appState.missionExecutiveText) runLeadDeveloperAgent(appState.missionExecutiveText);
            });
            selectors.copyMissionExecutiveBtn.addEventListener('click', (e) => { if (appState.missionExecutiveText) copyToClipboard(appState.missionExecutiveText, e.currentTarget); });
            selectors.copyLeadDevBtn.addEventListener('click', (e) => { if (appState.leadDeveloperText) copyToClipboard(appState.leadDeveloperText, e.currentTarget); });
            
            updateOrchestrateButtonState();
        }

        setupPage();