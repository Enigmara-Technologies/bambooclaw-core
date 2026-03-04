// =========== AGENT CONTROL ===========
async function toggleDaemon() {
    if (daemonRunning) {
        try {
            stopTelegramPolling();
            await invokeShort("stop_daemon");
        } catch(e) {
            stopTelegramPolling();
        }
        daemonRunning = false;
        updateDaemonUI();
        var chatEl = document.getElementById("agent-chat-messages");
        if (chatEl) chatEl.innerHTML += '<div class="chat-msg assistant"><span class="role">Agent:</span> Daemon stopped.</div>';
        showToast("Agent daemon stopped", "info");
    } else {
        try {
            await invokeShort("start_daemon");
            daemonRunning = true;
            updateDaemonUI();
            var chatEl = document.getElementById("agent-chat-messages");
            if (chatEl) chatEl.innerHTML = '<div class="chat-msg assistant"><span class="role">Agent:</span> Daemon is online. How can I help you?</div>';
            showToast("Agent daemon started", "success");
            startTelegramPolling();
        } catch(e) {
            showToast("Failed to start daemon: " + (e.message || e), "error");
        }
    }
}

function updateDaemonUI() {
    var pill = document.getElementById("daemon-status-pill");
    var text = document.getElementById("daemon-status-text");
    var btn  = document.getElementById("btn-daemon-toggle");
    if (daemonRunning) {
        pill.className = "status-pill running";
        text.textContent = "Running";
        btn.textContent = "Stop Agent Daemon";
        btn.classList.add("btn-danger");
    } else {
        pill.className = "status-pill stopped";
        text.textContent = "Stopped";
        btn.textContent = "Start Agent Daemon";
        btn.classList.remove("btn-danger");
    }
}

async function emergencyFlush() {
    showToast("Flushing system processes...", "info");
    stopTelegramPolling();
    try { await invokeShort("emergency_flush"); } catch(e) {
        try { await invokeShort("stop_daemon"); } catch(e2) {}
    }
    daemonRunning = false;
    updateDaemonUI();
    chatHistory = [];
    var chatEl = document.getElementById("agent-chat-messages");
    if (chatEl) chatEl.innerHTML = '<div class="chat-msg assistant"><span class="role">Agent:</span> System flushed. All processes stopped and memory cleared.</div>';
    showToast("System flushed successfully", "success");
}

async function sendAgentMessage(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    var input = document.getElementById("agent-chat-input");
    var msg = input.value.trim();
    if (!msg) return;
    input.value = "";

    var chatEl = document.getElementById("agent-chat-messages");
    chatEl.innerHTML += '<div class="chat-msg"><span class="role">You:</span> ' + escapeHtml(msg) + '</div>';
    chatEl.scrollTop = chatEl.scrollHeight;

    if (!daemonRunning) {
        chatEl.innerHTML += '<div class="chat-msg assistant"><span class="role">Agent:</span> Daemon is not running. Please start it first.</div>';
        chatEl.scrollTop = chatEl.scrollHeight;
        return;
    }

    chatEl.innerHTML += '<div class="chat-msg assistant" id="typing-indicator"><span class="role">Agent:</span> <span class="spinner">⟳</span> Thinking...</div>';
    chatEl.scrollTop = chatEl.scrollHeight;

    try {
        var reply = await callLLM(msg);
        var typing = document.getElementById("typing-indicator");
        if (typing) typing.remove();
        chatEl.innerHTML += '<div class="chat-msg assistant"><span class="role">Agent:</span> ' + formatMarkdownToHtml(reply || "(no response)") + '</div>';
    } catch(err) {
        var typing = document.getElementById("typing-indicator");
        if (typing) typing.remove();
        chatEl.innerHTML += '<div class="chat-msg assistant"><span class="role">Agent:</span> Error: ' + escapeHtml(err.message || String(err)) + '</div>';
    }
    chatEl.scrollTop = chatEl.scrollHeight;
    return false;
}

// =========== LLM CALL WITH TOOL CALLING ===========
var chatHistory = [];
var MAX_TOOL_ITERATIONS = 10;

var agentTools = [
    { type: "function", function: { name: "run_shell", description: "Execute a shell command on the user's computer. Returns stdout+stderr.", parameters: { type: "object", properties: { command: { type: "string" }, args: { type: "array", items: { type: "string" } } }, required: ["command"], additionalProperties: false } } },
    { type: "function", function: { name: "read_file", description: "Read the contents of a file on the user's computer.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } },
    { type: "function", function: { name: "write_file", description: "Write content to a file on the user's computer.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false } } },
    { type: "function", function: { name: "http_request", description: "Make an HTTP request.", parameters: { type: "object", properties: { url: { type: "string" }, method: { type: "string" }, headers: { type: "object" }, body: { type: "string" } }, required: ["url"], additionalProperties: false } } },
    { type: "function", function: { name: "list_directory", description: "List files and folders.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } },
    { type: "function", function: { name: "take_screenshot", description: "Take a screenshot of the user's screen.", parameters: { type: "object", properties: { filename: { type: "string" } }, additionalProperties: false } } }
];

var pendingApprovalId = 0;
async function awaitUserApproval(toolName, args) {
    return new Promise(function(resolve, reject) {
        pendingApprovalId++;
        var aid = "approval-" + pendingApprovalId;
        var argsStr = JSON.stringify(args);
        if (argsStr.length > 300) argsStr = argsStr.substring(0, 300) + "...";
        var chatArea = document.getElementById("chat-area");
        if (!chatArea) { resolve(true); return; }
        var card = document.createElement("div");
        card.className = "approval-card";
        card.id = aid;
        card.innerHTML = '<div class="approval-title">⚠ Approval Required</div>' +
            '<div class="approval-detail"><strong>' + escapeHtml(toolName) + '</strong><br>' + escapeHtml(argsStr) + '</div>' +
            '<div class="approval-actions">' +
            '<button class="btn-approve" data-aid="' + aid + '">✓ Allow</button>' +
            '<button class="btn-deny" data-aid="' + aid + '">✗ Deny</button>' +
            '</div>' +
            '<div class="approval-timeout">Auto-denies in 120 seconds</div>';
        chatArea.appendChild(card);
        chatArea.scrollTop = chatArea.scrollHeight;
        var timeout = setTimeout(function() { cleanup(); reject(new Error("User approval timed out for: " + toolName)); }, 120000);
        function cleanup() { var el = document.getElementById(aid); if (el) el.remove(); }
        card.querySelector(".btn-approve").addEventListener("click", function() { clearTimeout(timeout); cleanup(); resolve(true); });
        card.querySelector(".btn-deny").addEventListener("click", function() { clearTimeout(timeout); cleanup(); reject(new Error("User denied tool execution")); });
    });
}

var DANGEROUS_TOOLS = ["run_shell", "write_file", "docker_command", "ssh_execute", "mqtt_publish"];

async function executeTool(toolName, args) {
    appendLog("unified-log", "[AGENT] [TOOL] Executing: " + toolName + "(" + JSON.stringify(args).substring(0, 100) + ")");
    var autonomy = (currentConfig.settings && currentConfig.settings.autonomy) || "collaborative";
    if (autonomy === "observe") return "[BLOCKED] Observation Only mode is active.";
    if (autonomy === "collaborative") {
        var isDangerous = DANGEROUS_TOOLS.indexOf(toolName) >= 0 || toolName.startsWith("composio_");
        if (isDangerous) {
            try { await awaitUserApproval(toolName, args); } catch(e) { return "Tool execution denied: " + (e.message || String(e)); }
        }
    }
    try {
        if (toolName === "run_shell") {
            return (await invokeShort("run_shell_command", { commandName: args.command || "", args: args.args || [] })) || "(no output)";
        } else if (toolName === "read_file") {
            var platform = await invokeShort("get_platform");
            return (await invokeShort("run_shell_command", platform === "windows" ? { commandName: "cmd", args: ["/c","type",args.path] } : { commandName: "cat", args: [args.path] })) || "(empty file)";
        } else if (toolName === "write_file") {
            var platform2 = await invokeShort("get_platform");
            if (platform2 === "windows") {
                await invokeShort("run_shell_command", { commandName: "powershell", args: ["-Command", "Set-Content -Path '" + args.path.replace(/'/g,"''") + "' -Value '" + (args.content||"").replace(/'/g,"''") + "'"] });
            } else {
                await invokeShort("run_shell_command", { commandName: "bash", args: ["-c", "cat > '" + args.path.replace(/'/g,"'\\''")+  "' << 'BCEOF'\n" + (args.content||"") + "\nBCEOF"] });
            }
            return "File written successfully: " + args.path;
        } else if (toolName === "http_request") {
            var method = (args.method || "GET").toUpperCase();
            var fetchOpts = { method: method, headers: args.headers || {} };
            if (args.body && ["POST","PUT","PATCH"].includes(method)) fetchOpts.body = args.body;
            var resp = await fetch(args.url, fetchOpts);
            return "HTTP " + resp.status + "\n" + (await resp.text()).substring(0, 5000);
        } else if (toolName === "list_directory") {
            var platform3 = await invokeShort("get_platform");
            return (await invokeShort("run_shell_command", platform3 === "windows" ? { commandName: "dir", args: ["/B", args.path] } : { commandName: "ls", args: ["-la", args.path] })) || "(empty directory)";
        } else if (toolName === "take_screenshot") {
            var fname = args.filename || "screenshot.png";
            var platform4 = await invokeShort("get_platform");
            var screenshotPath = platform4 === "windows" ? "C:\\tmp\\" + fname : "/tmp/" + fname;
            var pyCmd = "import pyautogui; pyautogui.screenshot('" + screenshotPath.replace(/\\/g,"\\\\") + "'); print('" + screenshotPath + "')";
            var result = await invokeShort("run_shell_command", { commandName: "python", args: ["-c", pyCmd] });
            return "Screenshot saved to: " + screenshotPath + "\n" + (result || "");
        } else if (["web_browse","web_search","docker_command","ssh_execute","mqtt_publish"].indexOf(toolName) >= 0 || toolName.startsWith("composio_")) {
            return await executeSkillTool(toolName, args);
        } else {
            return "Unknown tool: " + toolName;
        }
    } catch(e) {
        return "Tool error: " + (e.message || String(e));
    }
}

async function callLLM(userMessage) {
    var cfg = currentConfig.llm;
    if (!cfg || !cfg.api_key) throw new Error("No LLM configured. Go to LLM Settings and apply a configuration.");

    chatHistory.push({ role: "user", content: userMessage });
    if (chatHistory.length > 30) chatHistory = chatHistory.slice(-30);

    var provider = cfg.provider, model = cfg.model, apiKey = cfg.api_key;
    var platform = "unknown";
    try { platform = await invokeShort("get_platform"); } catch(e) {}
    var autonomy = (currentConfig.settings && currentConfig.settings.autonomy) || "collaborative";
    var maxIter = (currentConfig.settings && currentConfig.settings.maxToolIterations) || MAX_TOOL_ITERATIONS;

    var systemPrompt = "You are BambooClaw, an AI agent running on the user's " + platform + " computer.\n\n";
    if (autonomy === "observe") {
        systemPrompt += "MODE: OBSERVATION ONLY.\n\n";
    } else if (autonomy === "collaborative") {
        systemPrompt += "MODE: COLLABORATIVE.\n\n";
    } else {
        systemPrompt += "MODE: FULL AUTONOMY. You have absolute control over this computer.\n\n";
        systemPrompt += "CRITICAL RULES:\n1. NEVER tell the user to do something manually.\n2. Chain as many tool calls as needed. Max iterations: " + maxIter + "\n3. Complete ALL steps before responding.\n";
    }

    var userSystemPrompt = (cfg && cfg.system_prompt) ? cfg.system_prompt.trim() : "";
    var personaPrompt = (activePersonaIndex >= 0 && activePersonaIndex < personas.length) ? personas[activePersonaIndex].prompt.trim() : "";
    if (userSystemPrompt || personaPrompt) {
        systemPrompt += "\n--- OPERATOR INSTRUCTIONS ---\n";
        if (userSystemPrompt) systemPrompt += userSystemPrompt + "\n";
        if (personaPrompt) systemPrompt += "\n--- ACTIVE PERSONA ---\n" + personaPrompt + "\n--- END PERSONA ---\n";
        systemPrompt += "--- END OPERATOR INSTRUCTIONS ---\n";
    }

    var apiUrl, headers, supportsTools = true;
    if (provider === "openrouter") { apiUrl = "https://openrouter.ai/api/v1/chat/completions"; headers = { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "HTTP-Referer": "https://bambooclaw.com" }; }
    else if (provider === "openai") { apiUrl = "https://api.openai.com/v1/chat/completions"; headers = { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" }; }
    else if (provider === "groq") { apiUrl = "https://api.groq.com/openai/v1/chat/completions"; headers = { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" }; }
    else if (provider === "deepseek") { apiUrl = "https://api.deepseek.com/v1/chat/completions"; headers = { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" }; }
    else if (provider === "mistral") { apiUrl = "https://api.mistral.ai/v1/chat/completions"; headers = { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" }; }
    else if (provider === "anthropic") { apiUrl = "https://api.anthropic.com/v1/messages"; headers = { "x-api-key": apiKey, "Content-Type": "application/json", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }; supportsTools = false; }
    else if (provider === "google") { apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey; headers = { "Content-Type": "application/json" }; supportsTools = false; }
    else if (provider === "ollama") { apiUrl = "http://localhost:11434/api/chat"; headers = { "Content-Type": "application/json" }; supportsTools = false; }
    else if (provider === "inception") { apiUrl = "https://api.inceptionlabs.ai/v1/chat/completions"; headers = { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" }; }
    else { throw new Error("Unsupported provider: " + provider); }

    var messages = [{ role: "system", content: systemPrompt }].concat(chatHistory);

    function updatePayloadInspector(body) {
        var el = document.getElementById("llm-payload-display");
        if (el) { el.textContent = JSON.stringify(body, null, 2); el.scrollTop = 0; }
    }

    if (!supportsTools) {
        var body;
        if (provider === "anthropic") body = { model: model, max_tokens: 2048, system: systemPrompt, messages: chatHistory };
        else if (provider === "google") body = { contents: [{ parts: [{ text: userMessage }] }] };
        else if (provider === "ollama") body = { model: model, messages: messages, stream: false };
        updatePayloadInspector(body);
        var resp = await fetch(apiUrl, { method: "POST", headers: headers, body: JSON.stringify(body) });
        if (!resp.ok) throw new Error("LLM API error (HTTP " + resp.status + ")");
        var data = await resp.json();
        var reply = "";
        if (provider === "anthropic") reply = (data.content && data.content[0] && data.content[0].text) || "(empty)";
        else if (provider === "google") reply = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || "(empty)";
        else if (provider === "ollama") reply = (data.message && data.message.content) || "(empty)";
        chatHistory.push({ role: "assistant", content: reply });
        return reply;
    }

    for (var iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        var dedupedTools = [], seenToolNames = {};
        agentTools.forEach(function(t) {
            var tn = t.function.name;
            if (!seenToolNames[tn]) { seenToolNames[tn] = true; if (!t.function.description) t.function.description = tn; dedupedTools.push(t); }
        });
        var reqBody = { model: model, messages: messages, max_tokens: 4096 };
        if (dedupedTools.length > 0) { reqBody.tools = dedupedTools; reqBody.tool_choice = "auto"; }
        updatePayloadInspector(reqBody);

        var resp2 = await fetch(apiUrl, { method: "POST", headers: headers, body: JSON.stringify(reqBody) });
        if (!resp2.ok) {
            chatHistory.pop();
            var errText = await resp2.text();
            if (resp2.status === 401) throw new Error("HTTP 401: Invalid API Key. Check your " + provider + " key.");
            throw new Error("LLM API error (HTTP " + resp2.status + ") - " + errText.substring(0, 100));
        }
        var data2 = await resp2.json();
        var choice = data2.choices && data2.choices[0];
        if (!choice) throw new Error("No response from LLM");

        var assistantMsg = choice.message;
        messages.push(assistantMsg);

        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
            for (var t = 0; t < assistantMsg.tool_calls.length; t++) {
                var tc = assistantMsg.tool_calls[t];
                var toolArgs = {};
                try { toolArgs = JSON.parse(tc.function.arguments); } catch(e) {}
                var toolResult = await executeTool(tc.function.name, toolArgs);
                messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
            }
            continue;
        }

        var reply2 = assistantMsg.content || "(no response)";
        chatHistory.push({ role: "assistant", content: reply2 });
        return reply2;
    }

    var lastMsg = messages[messages.length - 1];
    var reply3 = (lastMsg && lastMsg.content) || "(max tool iterations reached)";
    chatHistory.push({ role: "assistant", content: reply3 });
    return reply3;
}

// =========== TELEGRAM POLLING ===========
var tgPollingTimeout = null;
var tgLastUpdateId = 0;

function startTelegramPolling() {
    if (tgPollingTimeout) return;
    var token = currentConfig.channels && currentConfig.channels.telegram && currentConfig.channels.telegram.token;
    if (!token) { appendLog("dash-log", "[TG-POLL] No Telegram token, skipping polling"); return; }
    appendLog("dash-log", "[TG-POLL] Starting Telegram polling...");
    pollTelegramLoop();
}

async function pollTelegramLoop() {
    if (!daemonRunning) return;
    await pollTelegram();
    tgPollingTimeout = setTimeout(pollTelegramLoop, 3000);
}

function stopTelegramPolling() {
    if (tgPollingTimeout) { clearTimeout(tgPollingTimeout); tgPollingTimeout = null; appendLog("dash-log", "[TG-POLL] Stopped"); }
}

async function pollTelegram() {
    var token = currentConfig.channels && currentConfig.channels.telegram && currentConfig.channels.telegram.token;
    if (!token || !daemonRunning) return;
    try {
        var url = "https://api.telegram.org/bot" + token + "/getUpdates?offset=" + (tgLastUpdateId + 1) + "&timeout=1&allowed_updates=[%22message%22]";
        var resp = await fetch(url);
        if (!resp.ok) return;
        var data = await resp.json();
        if (!data.ok || !data.result || data.result.length === 0) return;
        for (var i = 0; i < data.result.length; i++) {
            var update = data.result[i];
            tgLastUpdateId = update.update_id;
            if (update.message && update.message.text) {
                var chatId = update.message.chat.id;
                var text = update.message.text;
                var from = (update.message.from && update.message.from.first_name) || "User";
                appendLog("unified-log", "[AGENT] [TELEGRAM] Message from " + from + ": " + text);
                var chatEl = document.getElementById("agent-chat-messages");
                if (chatEl) {
                    chatEl.innerHTML += '<div class="chat-msg"><span class="role">You (Telegram):</span> ' + escapeHtml(text) + '</div>';
                    chatEl.scrollTop = chatEl.scrollHeight;
                }
                try {
                    var reply = await callLLM(text);
                    await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: stripMarkdownForTelegram(reply), parse_mode: "Markdown" }) });
                    if (chatEl) {
                        chatEl.innerHTML += '<div class="chat-msg assistant"><span class="role">Agent:</span> ' + formatMarkdownToHtml(reply || "(no response)") + '</div>';
                        chatEl.scrollTop = chatEl.scrollHeight;
                    }
                } catch(e) {
                    await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: "Sorry, I encountered an error: " + (e.message || "unknown") }) });
                }
            }
        }
    } catch(e) {}
}
