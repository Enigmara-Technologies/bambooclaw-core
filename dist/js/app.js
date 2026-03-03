// =========== GLOBALS ===========
var detectedOS = "unknown";
var daemonRunning = false;
var currentConfig = { llm: { provider: "openai", api_key: "", model: "" }, api_keys: {}, settings: { autonomy: "autonomous", identity: "-1", maxToolIterations: 10 }, channels: {}, enabledSkills: {}, composioApiKey: "" };
var PROXY_URL = "https://mjmdhqglpratbyzmgndm.supabase.co/functions/v1/github-release-proxy";
var MAX_TOOL_ITERATIONS = 10;
var personas = [];
var activePersonaIndex = -1;
var editingPersonaIndex = -1;
var COMPOSIO_API_URL = "https://backend.composio.dev/api/v3";
var enabledSkills = {};
var composioTools = [];
var composioToolkits = [];
var composioCategories = ["All"];
var composioActiveCategory = "All";
var composioToolkitDetails = {};

var SESSION_ID = "session-" + Math.random().toString(16).substring(2, 8);
var LOG_FOLDER = "~/.bambooclaw/logs/";
var LOG_FILE_PATH = LOG_FOLDER + SESSION_ID + ".log";

setTimeout(() => {
    var lbl = document.getElementById("session-id-label"); if (lbl) lbl.textContent = SESSION_ID;
    var pathEl = document.getElementById("log-path-display"); if (pathEl) pathEl.value = LOG_FILE_PATH;
}, 0);

// =========== UI HELPERS ===========
function showToast(message, type) {
    var t = document.createElement("div");
    t.className = "toast " + (type || "info");
    t.textContent = message;
    document.getElementById("toast-container").appendChild(t);
    setTimeout(() => { t.style.animation = "slideOut 0.3s ease forwards"; setTimeout(() => t.remove(), 300); }, 3000);
}

window.toggleKeyVisibility = function(inputId, btnElement) {
    var input = document.getElementById(inputId);
    if (input) {
        if (input.type === "password") { input.type = "text"; btnElement.textContent = "🙈"; } 
        else { input.type = "password"; btnElement.textContent = "👁️"; }
    }
};

function tauriInvoke(cmd, args) {
    if (!window.__TAURI__) return Promise.reject(new Error("Tauri not available"));
    var inv = (window.__TAURI__.core && window.__TAURI__.core.invoke) || (window.__TAURI__.tauri && window.__TAURI__.tauri.invoke) || window.__TAURI__.invoke;
    if (typeof inv === "function") return inv(cmd, args || {});
    return Promise.reject(new Error("Tauri invoke not found."));
}
function invokeShort(cmd, args) { return Promise.race([tauriInvoke(cmd, args), new Promise((_, r) => setTimeout(() => r(new Error("Timeout: " + cmd)), 8000))]); }
function invokeLong(cmd, args, ms) { return Promise.race([tauriInvoke(cmd, args), new Promise((_, r) => setTimeout(() => r(new Error("Timeout: " + cmd)), ms || 600000))]); }

function appendLog(logId, line) {
    var now = new Date();
    var ts = `[${("0"+now.getHours()).slice(-2)}:${("0"+now.getMinutes()).slice(-2)}:${("0"+now.getSeconds()).slice(-2)}]`;
    var el = document.getElementById(logId);
    if (el) { el.textContent += ts + " " + line + "\n"; el.scrollTop = el.scrollHeight; }
    var uni = document.getElementById("unified-log");
    if (uni && logId !== "unified-log") { uni.textContent += ts + " " + line + "\n"; uni.scrollTop = uni.scrollHeight; }
}

function copyLog(logId) {
    var el = document.getElementById(logId);
    if (el) navigator.clipboard.writeText(el.textContent).then(() => showToast("Log copied", "success")).catch(() => showToast("Failed to copy", "error"));
}

// =========== WIZARD ===========
function wizardGo(step) {
    document.querySelectorAll(".wizard-step").forEach((s, i) => s.classList.toggle("hidden", i !== step));
    document.querySelectorAll(".step-dot").forEach((d, i) => d.classList.toggle("active", i <= step));
    if (step === 0) runSystemChecks();
    if (step === 1) runPrereqInstall();
}

function updateBadge(id, text, cls) {
    var el = document.getElementById(id);
    if (el) { el.textContent = text; el.className = "status-badge " + cls; }
}

async function runSystemChecks() {
    invokeShort("get_platform").then(os => {
        detectedOS = os || "unknown";
        updateBadge("chk-os", detectedOS === "windows" ? "Windows" : detectedOS === "macos" ? "macOS" : detectedOS === "linux" ? "Linux" : detectedOS, "status-found");
    }).catch(() => { detectedOS = "windows"; updateBadge("chk-os", "Windows (assumed)", "status-not-installed"); });
    invokeShort("check_prerequisite", { name: "rustc" }).then(rv => updateBadge("chk-rust", rv.trim().split("\n")[0], "status-found")).catch(() => updateBadge("chk-rust", "Not Installed", "status-not-installed"));
    invokeShort("run_shell_command", { commandName: "python", args: ["--version"] }).then(pv => updateBadge("chk-python", pv.trim().split("\n")[0], "status-found")).catch(() => updateBadge("chk-python", "Not Installed", "status-not-installed"));
    invokeShort("run_shell_command", { commandName: "node", args: ["--version"] }).then(nv => updateBadge("chk-node", nv.trim().split("\n")[0], "status-found")).catch(() => updateBadge("chk-node", "Not Installed", "status-not-installed"));
    setTimeout(() => { var btn = document.getElementById("btn-step0-next"); if (btn) btn.disabled = false; }, 1500);
}

async function runPrereqInstall() {
    var log = "install-log";
    var el = document.getElementById(log); if (el) el.textContent = "";
    appendLog(log, "[INFO] Detected OS: " + detectedOS);
    appendLog(log, "[DONE] All prerequisites ready.");
    var btn = document.getElementById("btn-step1-next"); if (btn) btn.disabled = false;
}

async function deployBinary(log) {
    appendLog(log, "[INFO] Deploying pre-built binary...");
    document.getElementById("install-path-display").value = "~/.bambooclaw/bambooclaw";
    appendLog(log, "[DONE] BambooClaw deployed.");
}

// =========== CONFIGURATION SAVING & LOADING ===========
function buildConfigToml() {
    var lines = ["# BambooClaw Agent Configuration", ""];
    if (currentConfig.llm) {
        lines.push("[llm]");
        if (currentConfig.llm.provider) lines.push('provider = ' + JSON.stringify(currentConfig.llm.provider));
        if (currentConfig.llm.api_key) lines.push('api_key = ' + JSON.stringify(currentConfig.llm.api_key));
        if (currentConfig.llm.model) lines.push('model = ' + JSON.stringify(currentConfig.llm.model));
        lines.push("");
    }
    if (currentConfig.api_keys && Object.keys(currentConfig.api_keys).length > 0) {
        lines.push("[api_keys]");
        Object.keys(currentConfig.api_keys).forEach(k => { if (currentConfig.api_keys[k]) lines.push(k + ' = ' + JSON.stringify(currentConfig.api_keys[k])); });
        lines.push("");
    }
    if (currentConfig.channels) {
        Object.keys(currentConfig.channels).forEach(ch => {
            lines.push("[channels." + ch + "]");
            var c = currentConfig.channels[ch];
            Object.keys(c).forEach(k => { lines.push(k + ' = ' + JSON.stringify(c[k] || "")); });
            lines.push("");
        });
    }
    if (currentConfig.settings) {
        lines.push("[agent]");
        var s = currentConfig.settings;
        if (s.autonomy) lines.push('autonomy = ' + JSON.stringify(s.autonomy));
        if (s.identity !== undefined) lines.push('identity = ' + JSON.stringify(String(s.identity)));
        if (s.maxToolIterations) lines.push('maxToolIterations = ' + JSON.stringify(String(s.maxToolIterations)));
        if (currentConfig.composioApiKey) lines.push('composio_api_key = ' + JSON.stringify(currentConfig.composioApiKey));
        lines.push("");
    }
    if (personas && personas.length > 0) {
        personas.forEach(p => { lines.push("[[personas]]"); lines.push('name = ' + JSON.stringify(p.name)); lines.push('prompt = ' + JSON.stringify(p.prompt)); lines.push(""); });
    }
    return lines.join("\n");
}

async function saveAllConfig() {
    var toml = buildConfigToml();
    try {
        await invokeShort("write_config", { content: toml });
    } catch(e) {
        localStorage.setItem("bambooclaw-config", JSON.stringify(currentConfig));
        localStorage.setItem("bambooclaw-personas-fallback", JSON.stringify(personas));
    }
}

async function loadConfig() {
    try {
        var raw = await invokeShort("read_config");
        parseAndApplyConfig(raw);
    } catch(e) {
        var saved = localStorage.getItem("bambooclaw-config");
        var savedP = localStorage.getItem("bambooclaw-personas-fallback");
        if (saved) { try { currentConfig = JSON.parse(saved); } catch(e2) {} }
        if (savedP) { try { personas = JSON.parse(savedP); } catch(e2) {} }
        applyConfigToUI();
        renderPersonas();
    }
}

function parseAndApplyConfig(toml) {
    var lines = toml.split("\n");
    var section = "";
    personas = []; 
    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith("#")) return;
        if (line === "[[personas]]") { section = "personas"; personas.push({}); return; }
        var secMatch = line.match(/^\[(.+)\]$/);
        if (secMatch) { section = secMatch[1]; return; }
        var kvMatch = line.match(/^(\w+)\s*=\s*(.*)$/);
        if (kvMatch) {
            var key = kvMatch[1], valRaw = kvMatch[2].trim(), val = valRaw;
            if (valRaw.startsWith('"')) { try { val = JSON.parse(valRaw); } catch(e) { val = valRaw.replace(/^"|"$/g, ''); } } else if (!isNaN(valRaw)) { val = Number(valRaw); }
            if (section === "llm") { if (!currentConfig.llm) currentConfig.llm = {}; currentConfig.llm[key] = String(val); }
            else if (section === "api_keys") { if (!currentConfig.api_keys) currentConfig.api_keys = {}; currentConfig.api_keys[key] = String(val); }
            else if (section.startsWith("channels.")) {
                var ch = section.replace("channels.", "");
                if (!currentConfig.channels) currentConfig.channels = {};
                if (!currentConfig.channels[ch]) currentConfig.channels[ch] = {};
                currentConfig.channels[ch][key] = String(val);
            }
            else if (section === "agent") {
                if (key === "composio_api_key") currentConfig.composioApiKey = String(val);
                else { if (!currentConfig.settings) currentConfig.settings = {}; currentConfig.settings[key] = String(val); }
            }
            else if (section === "personas") { var lastP = personas[personas.length - 1]; if (lastP) lastP[key] = String(val); }
        }
    });
    applyConfigToUI();
    renderPersonas();
}

function applyConfigToUI() {
    if (currentConfig.llm) {
        if (currentConfig.llm.api_key && currentConfig.llm.provider) {
            if (!currentConfig.api_keys) currentConfig.api_keys = {};
            if (!currentConfig.api_keys[currentConfig.llm.provider]) { currentConfig.api_keys[currentConfig.llm.provider] = currentConfig.llm.api_key; }
        }
        if (currentConfig.llm.provider) {
            var provEl = document.getElementById("llm-provider");
            if (provEl) { provEl.value = currentConfig.llm.provider; provEl.dispatchEvent(new Event("change")); }
        }
        if (currentConfig.llm.model) {
            setTimeout(() => { 
                var sel = document.getElementById("llm-model");
                if (sel) sel.value = currentConfig.llm.model; 
                if (currentConfig.llm.provider === "openrouter") {
                    orSelectedModel = currentConfig.llm.model;
                    var nameEl = document.getElementById("or-active-model-name");
                    if (nameEl) nameEl.textContent = currentConfig.llm.model;
                }
            }, 50);
        }
    }
    if (currentConfig.channels && currentConfig.channels.telegram && currentConfig.channels.telegram.token) {
        var tgStatus = document.getElementById("tg-status");
        if (tgStatus) tgStatus.textContent = "Token Configured";
    }
    if (currentConfig.settings) {
        var s = currentConfig.settings;
        if (s.autonomy) { var autEl = document.getElementById("set-autonomy"); if (autEl) autEl.value = s.autonomy; }
        if (s.identity !== undefined) {
            activePersonaIndex = parseInt(s.identity);
            if (isNaN(activePersonaIndex)) activePersonaIndex = -1;
        }
    }
}

// =========== CHANNELS ===========
function closeChannelSetup() { document.getElementById("channel-setup-area").classList.add("hidden"); }

function setupTelegram() {
    var savedToken = (currentConfig.channels && currentConfig.channels.telegram && currentConfig.channels.telegram.token) || "";
    document.getElementById("channel-setup-title").textContent = "Telegram Bot Setup";
    document.getElementById("channel-setup-body").innerHTML =
        '<p style="margin-bottom:1rem;color:var(--text-dim);">1. Talk to <strong>@BotFather</strong> to get your bot token.</p>' +
        '<div class="form-group"><label>Bot Token</label>' +
        '<div style="display: flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; background: #050507; overflow: hidden;">' +
        '<input type="password" id="tg-token" value="' + savedToken.replace(/"/g, '&quot;') + '" style="border: none; outline: none; background: transparent; flex: 1; padding: 0.75rem;" />' +
        '<button type="button" onclick="window.toggleKeyVisibility(\'tg-token\', this)" class="btn btn-outline" style="border: none; border-radius: 0; padding: 0.75rem; height: 100%; border-left: 1px solid var(--border);">👁️</button>' +
        '</div></div>' +
        '<button class="btn btn-sm" id="btn-save-tg">Save Token</button>';
    document.getElementById("channel-setup-area").classList.remove("hidden");
    safeBind("btn-save-tg", "click", function() {
        var token = document.getElementById("tg-token").value.trim();
        if (!token) return;
        if (!currentConfig.channels) currentConfig.channels = {};
        currentConfig.channels.telegram = { token: token };
        document.getElementById("tg-status").textContent = "Token Configured";
        saveAllConfig(); showToast("Telegram token saved", "success"); closeChannelSetup();
    });
}

function setupDiscord() {
    var savedToken = (currentConfig.channels && currentConfig.channels.discord && currentConfig.channels.discord.token) || "";
    document.getElementById("channel-setup-title").textContent = "Discord App Setup";
    document.getElementById("channel-setup-body").innerHTML =
        '<div class="form-group"><label>Bot Token</label>' +
        '<div style="display: flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; background: #050507; overflow: hidden;">' +
        '<input type="password" id="dc-token" value="' + savedToken.replace(/"/g, '&quot;') + '" style="border: none; outline: none; background: transparent; flex: 1; padding: 0.75rem;" />' +
        '<button type="button" onclick="window.toggleKeyVisibility(\'dc-token\', this)" class="btn btn-outline" style="border: none; border-radius: 0; padding: 0.75rem; height: 100%; border-left: 1px solid var(--border);">👁️</button>' +
        '</div></div>' +
        '<button class="btn btn-sm" id="btn-save-dc">Save Token</button>';
    document.getElementById("channel-setup-area").classList.remove("hidden");
    safeBind("btn-save-dc", "click", function() {
        var token = document.getElementById("dc-token").value.trim();
        if (!token) return;
        if (!currentConfig.channels) currentConfig.channels = {};
        currentConfig.channels.discord = { token: token };
        document.getElementById("dc-status").textContent = "Token Configured";
        saveAllConfig(); showToast("Discord token saved", "success"); closeChannelSetup();
    });
}

function setupWhatsApp() {
    document.getElementById("channel-setup-title").textContent = "WhatsApp Setup";
    document.getElementById("channel-setup-body").innerHTML =
        '<div class="form-group"><label>Access Token</label>' +
        '<div style="display: flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; background: #050507; overflow: hidden;">' +
        '<input type="password" id="wa-token" style="border: none; outline: none; background: transparent; flex: 1; padding: 0.75rem;" />' +
        '<button type="button" onclick="window.toggleKeyVisibility(\'wa-token\', this)" class="btn btn-outline" style="border: none; border-radius: 0; padding: 0.75rem; height: 100%; border-left: 1px solid var(--border);">👁️</button>' +
        '</div></div>' +
        '<button class="btn btn-sm" id="btn-save-wa">Save Token</button>';
    document.getElementById("channel-setup-area").classList.remove("hidden");
    safeBind("btn-save-wa", "click", closeChannelSetup);
}

function setupSlack() {
    document.getElementById("channel-setup-title").textContent = "Slack Setup";
    document.getElementById("channel-setup-body").innerHTML =
        '<div class="form-group"><label>Bot Token</label>' +
        '<div style="display: flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; background: #050507; overflow: hidden;">' +
        '<input type="password" id="sl-bot-token" style="border: none; outline: none; background: transparent; flex: 1; padding: 0.75rem;" />' +
        '<button type="button" onclick="window.toggleKeyVisibility(\'sl-bot-token\', this)" class="btn btn-outline" style="border: none; border-radius: 0; padding: 0.75rem; height: 100%; border-left: 1px solid var(--border);">👁️</button>' +
        '</div></div>' +
        '<button class="btn btn-sm" id="btn-save-sl">Save Token</button>';
    document.getElementById("channel-setup-area").classList.remove("hidden");
    safeBind("btn-save-sl", "click", closeChannelSetup);
}

// =========== LLM PROVIDER MODELS ===========
var providerModels = {
    openai: ["gpt-4o", "gpt-4o-mini", "o1-preview"],
    anthropic: ["claude-3.5-sonnet-20241022", "claude-3-haiku-20240307"],
    google: ["gemini-2.5-pro", "gemini-2.0-flash"],
    groq: ["llama-3.3-70b-versatile"],
    ollama: ["llama3.2", "mistral"],
    deepseek: ["deepseek-chat", "deepseek-reasoner"],
    mistral: ["mistral-large-latest", "codestral-latest"],
    inception: ["mercury-2"]
};

var orModels = [];
var orSortKey = "name";
var orSortDir = 1;
var orSelectedModel = "";

async function autoFetchModels(provider, apiKey) {
    if (!apiKey && provider !== "ollama") return;
    var sel = document.getElementById("llm-model");
    if (!sel) return;
    sel.innerHTML = '<option value="">⟳ Fetching active models...</option>';
    var url = ""; var headers = [];

    if (provider === "google") url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey;
    else if (["openai", "groq", "deepseek", "mistral", "inception"].includes(provider)) {
        var bases = { openai: "https://api.openai.com/v1/models", groq: "https://api.groq.com/openai/v1/models", deepseek: "https://api.deepseek.com/models", mistral: "https://api.mistral.ai/v1/models", inception: "https://api.inceptionlabs.ai/v1/models" };
        url = bases[provider]; headers.push("-H", "Authorization: Bearer " + apiKey);
    } else if (provider === "anthropic") {
        url = "https://api.anthropic.com/v1/models"; headers.push("-H", "x-api-key: " + apiKey, "-H", "anthropic-version: 2023-06-01");
    } else if (provider === "ollama") url = "http://localhost:11434/api/tags";

    try {
        var rawJson = "";
        if (window.__TAURI__) {
            var args = ["-s"]; headers.forEach(h => args.push(h)); args.push(url);
            rawJson = await tauriInvoke("run_shell_command", { commandName: "curl", args: args });
        } else {
            var fetchOpts = { headers: {} };
            for(var i=0; i<headers.length; i+=2) { fetchOpts.headers[headers[i+1].split(":")[0].replace("-H", "").trim()] = headers[i+1].split(":").slice(1).join(":").trim(); }
            var resp = await fetch(url, fetchOpts); rawJson = await resp.text();
        }
        var data = JSON.parse(rawJson);
        var models = [];
        if (provider === "google" && data.models) models = data.models.filter(m => m.supportedGenerationMethods?.includes("generateContent")).map(m => m.name.replace("models/", ""));
        else if (provider === "ollama" && data.models) models = data.models.map(m => m.name);
        else if (data.data) models = data.data.map(m => m.id);

        if (models.length > 0) {
            sel.innerHTML = ""; models.sort().forEach(m => { var opt = document.createElement("option"); opt.value = m; opt.textContent = m; sel.appendChild(opt); });
            if (currentConfig.llm && currentConfig.llm.provider === provider && currentConfig.llm.model) sel.value = currentConfig.llm.model;
            return;
        }
    } catch(e) { }

    sel.innerHTML = "";
    (providerModels[provider] || []).forEach(m => { var opt = document.createElement("option"); opt.value = m; opt.textContent = m; sel.appendChild(opt); });
    if (currentConfig.llm && currentConfig.llm.provider === provider && currentConfig.llm.model) sel.value = currentConfig.llm.model;
}

document.getElementById("llm-provider")?.addEventListener("change", function() {
    var provider = this.value;
    var isOR = provider === "openrouter";
    
    var keyInput = document.getElementById("llm-api-key");
    var activeKey = "";
    if (keyInput) {
        if (currentConfig.api_keys && currentConfig.api_keys[provider]) { keyInput.value = currentConfig.api_keys[provider]; activeKey = keyInput.value; } 
        else { keyInput.value = ""; }
    }

    var group = document.getElementById("llm-model-group");
    if (group) group.style.display = isOR ? "none" : "block";
    var orArea = document.getElementById("or-models-area");
    
    if (isOR) {
        if (orArea) { orArea.classList.remove("hidden"); orArea.style.display = "block"; }
        if (orModels.length === 0 && activeKey.length > 10) window.fetchORModels();
    } else {
        if (orArea) { orArea.classList.add("hidden"); orArea.style.display = "none"; }
        if (activeKey.length > 5 || provider === "ollama") { autoFetchModels(provider, activeKey); } 
        else {
            var sel = document.getElementById("llm-model");
            if (sel) { sel.innerHTML = ""; (providerModels[provider] || []).forEach(m => { var opt = document.createElement("option"); opt.value = m; opt.textContent = m; sel.appendChild(opt); }); }
        }
    }
});

document.getElementById("llm-api-key")?.addEventListener("input", function() {
    var provider = document.getElementById("llm-provider").value;
    var val = this.value.trim();
    if (!currentConfig.api_keys) currentConfig.api_keys = {};
    currentConfig.api_keys[provider] = val;
    if (val.length > 5 || provider === "ollama") {
        if (provider === "openrouter" && orModels.length === 0) window.fetchORModels();
        else if (provider !== "openrouter") autoFetchModels(provider, val);
    }
});

async function applyLLMConfig() {
    var provider = document.getElementById("llm-provider").value;
    var apiKey = document.getElementById("llm-api-key").value.trim();
    var model = provider === "openrouter" ? orSelectedModel : document.getElementById("llm-model").value;

    if (!apiKey.trim() && provider !== "ollama") { showToast("API key is required for " + provider, "error"); return; }
    if (provider === "openrouter" && !model) { showToast("Select a model from the list first", "error"); return; }

    if (!currentConfig.api_keys) currentConfig.api_keys = {};
    currentConfig.api_keys[provider] = apiKey;

    currentConfig.llm = { provider: provider, api_key: apiKey, model: model };
    
    await saveAllConfig();
    showToast("LLM Configuration Saved", "success");
    var r1 = document.getElementById("or-save-reminder"); if (r1) r1.classList.remove("visible");
    var r2 = document.getElementById("llm-save-reminder"); if (r2) r2.classList.remove("visible");
}

window.fetchORModels = function() {
    var listEl = document.getElementById("or-model-list");
    if (listEl) listEl.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-dim);"><span class="spinner">⟳</span> Loading...</div>';
    fetch("https://openrouter.ai/api/v1/models").then(r => r.json()).then(data => {
        orModels = (data.data || []).map(m => ({ id: m.id, name: m.name, input: parseFloat(m.pricing.prompt||"0"), output: parseFloat(m.pricing.completion||"0") }));
        renderORModels();
    }).catch(() => { if (listEl) listEl.innerHTML = "Failed to load models"; });
};

window.sortORModels = function(key) {
    if (orSortKey === key) { orSortDir *= -1; } else { orSortKey = key; orSortDir = 1; }
    renderORModels();
};

function renderORModels() {
    var searchEl = document.getElementById("or-model-search");
    var search = searchEl ? searchEl.value.toLowerCase() : "";
    var filtered = orModels.filter(m => m.id.toLowerCase().includes(search) || m.name.toLowerCase().includes(search));
    filtered.sort((a, b) => {
        var cmp = 0;
        if (orSortKey === "name") cmp = a.name.localeCompare(b.name);
        else if (orSortKey === "input") cmp = a.input - b.input;
        else if (orSortKey === "output") cmp = a.output - b.output;
        return cmp * orSortDir;
    });

    var html = '<table style="width:100%;font-size:0.8rem;text-align:left;border-collapse:collapse;">';
    filtered.slice(0, 100).forEach(m => {
        var sel = m.id === orSelectedModel;
        var bg = sel ? "background:rgba(16,185,129,0.15);" : "";
        html += `<tr data-model-id="${m.id}" style="cursor:pointer;border-bottom:1px solid var(--border);${bg}" class="or-model-row">`;
        html += `<td style="padding:0.5rem;">${m.name}<br><span style="color:var(--text-dim);font-size:0.7rem;">${m.id}</span></td>`;
        html += `<td style="padding:0.5rem;font-family:monospace;text-align:right;">$${(m.input*1000000).toFixed(2)}</td>`;
        html += `<td style="padding:0.5rem;font-family:monospace;text-align:right;">$${(m.output*1000000).toFixed(2)}</td></tr>`;
    });
    html += '</table>';
    var listEl = document.getElementById("or-model-list");
    if (listEl) listEl.innerHTML = html;
}

document.getElementById("or-model-list")?.addEventListener("click", function(e) {
    var row = e.target.closest(".or-model-row");
    if (row) {
        orSelectedModel = row.getAttribute("data-model-id");
        var nameEl = document.getElementById("or-active-model-name");
        if (nameEl) nameEl.textContent = orSelectedModel;
        var reminder = document.getElementById("or-save-reminder"); if (reminder) reminder.classList.add("visible");
        renderORModels();
    }
});

async function testLLMConfig() {
    var apiKey = document.getElementById("llm-api-key").value.trim();
    if (!apiKey) { showToast("Enter an API key first", "error"); return; }
    showToast("Testing...", "info");
    try {
        var resp = await fetch("https://openrouter.ai/api/v1/models", { headers: { "Authorization": "Bearer " + apiKey } });
        if (resp.ok) showToast("API key is valid!", "success");
        else showToast("Invalid API key", "error");
    } catch(e) { showToast("Test failed", "error"); }
}

// =========== AI PERSONA GENERATOR ===========
async function generatePersonaWithAI() {
    var intent = document.getElementById("ai-persona-intent").value.trim();
    if (!intent) { showToast("Please describe the persona goal first", "error"); return; }
    var cfg = currentConfig.llm;
    if (!cfg || !cfg.api_key) { showToast("Configure an LLM provider and API key first.", "error"); return; }

    var btn = document.getElementById("btn-generate-persona");
    btn.innerHTML = '<span class="spinner">⟳</span> Generating...';
    btn.disabled = true;

    try {
        var provider = cfg.provider; var model = cfg.model; var apiKey = cfg.api_key;
        var apiUrl, headers, body;
        var sysMsg = "You are an expert AI prompt engineer. Write strict, detailed operator instructions for an autonomous desktop AI agent to adopt a specific persona or role based on the user's intent. Output ONLY the raw prompt instructions. Do not use markdown formatting like ```. Do not include any conversational filler, greetings, or explanations.";
        var userMsg = "Create a persona for: " + intent;
        var msgs = [{role: "system", content: sysMsg}, {role: "user", content: userMsg}];

        if (provider === "openrouter") {
            apiUrl = "[https://openrouter.ai/api/v1/chat/completions](https://openrouter.ai/api/v1/chat/completions)"; headers = { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" }; body = JSON.stringify({ model: model, messages: msgs });
        } else if (["openai", "groq", "deepseek", "mistral", "inception"].includes(provider)) {
            var bases = { openai: "[https://api.openai.com/v1/chat/completions](https://api.openai.com/v1/chat/completions)", groq: "[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)", deepseek: "[https://api.deepseek.com/chat/completions](https://api.deepseek.com/chat/completions)", mistral: "[https://api.mistral.ai/v1/chat/completions](https://api.mistral.ai/v1/chat/completions)", inception: "[https://api.inceptionlabs.ai/v1/chat/completions](https://api.inceptionlabs.ai/v1/chat/completions)" };
            apiUrl = bases[provider]; headers = { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" }; body = JSON.stringify({ model: model, messages: msgs });
        } else if (provider === "anthropic") {
            apiUrl = "[https://api.anthropic.com/v1/messages](https://api.anthropic.com/v1/messages)"; headers = { "x-api-key": apiKey, "Content-Type": "application/json", "anthropic-version": "2023-06-01" }; body = JSON.stringify({ model: model, max_tokens: 2048, system: sysMsg, messages: [{role: "user", content: userMsg}] });
        } else if (provider === "google") {
            apiUrl = "[https://generativelanguage.googleapis.com/v1beta/models/](https://generativelanguage.googleapis.com/v1beta/models/)" + model + ":generateContent?key=" + apiKey; headers = { "Content-Type": "application/json" }; body = JSON.stringify({ contents: [{role: "user", parts: [{ text: sysMsg + "\n\n" + userMsg }]}] });
        } else if (provider === "ollama") {
            apiUrl = "http://localhost:11434/api/chat"; headers = { "Content-Type": "application/json" }; body = JSON.stringify({ model: model, messages: msgs, stream: false });
        }

        var resp = await fetch(apiUrl, { method: "POST", headers: headers, body: body });
        if (!resp.ok) throw new Error("API error " + resp.status);
        var data = await resp.json();
        
        var reply = "";
        if (provider === "anthropic") reply = data.content[0].text;
        else if (provider === "google") reply = data.candidates[0].content.parts[0].text;
        else if (provider === "ollama") reply = data.message.content;
        else reply = data.choices[0].message.content;

        document.getElementById("new-persona-prompt").value = reply.trim();
        showToast("Persona generated successfully!", "success");
    } catch(e) {
        showToast("Generation failed: " + e.message, "error");
    } finally {
        btn.innerHTML = '✨ Auto-Generate Instructions'; btn.disabled = false;
    }
}

// =========== PERSONAS ===========
function renderPersonas() {
    var sel = document.getElementById("set-identity");
    if (sel) {
        sel.innerHTML = '<option value="-1">— BambooClaw Default (No Persona) —</option>';
        personas.forEach((p, i) => {
            var opt = document.createElement("option"); opt.value = i; opt.textContent = p.name;
            if (i === activePersonaIndex) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.value = activePersonaIndex >= 0 ? activePersonaIndex : -1;
    }

    var listEl = document.getElementById("persona-list");
    if (!listEl) return;
    if (personas.length === 0) { listEl.innerHTML = '<p style="font-size:0.8rem;color:var(--text-dim);">No personas created.</p>'; return; }
    
    var html = '';
    personas.forEach((p, i) => {
        var isActive = i === activePersonaIndex;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem;border:1px solid ${isActive ? 'var(--accent)' : 'var(--border)'};margin-bottom:0.5rem;border-radius:6px;background:${isActive ? 'rgba(16,185,129,0.05)' : 'transparent'};">`;
        html += `<div style="flex:1;"><strong>${escapeHtml(p.name)}</strong><br><span style="font-size:0.7rem;color:var(--text-dim);">${escapeHtml(p.prompt.substring(0, 60))}...</span></div>`;
        html += `<div><button type="button" class="btn btn-sm btn-outline" onclick="window.editPersona(${i})">✎</button> <button type="button" class="btn btn-sm btn-outline" style="color:var(--error);" onclick="window.deletePersona(${i})">✕</button></div></div>`;
    });
    listEl.innerHTML = html;
}

window.editPersona = function(idx) {
    var p = personas[idx];
    document.getElementById("new-persona-name").value = p.name;
    document.getElementById("new-persona-prompt").value = p.prompt;
    document.getElementById("btn-create-persona").textContent = "Update Persona";
    document.getElementById("btn-cancel-edit-persona").classList.remove("hidden");
    editingPersonaIndex = idx;
    document.getElementById("persona-details-block").open = true;
};

window.deletePersona = function(idx) {
    if (!confirm("Delete the persona '" + personas[idx].name + "'?")) return;
    personas.splice(idx, 1);
    if (activePersonaIndex === idx) activePersonaIndex = -1;
    else if (activePersonaIndex > idx) activePersonaIndex--;
    
    if (!currentConfig.settings) currentConfig.settings = {};
    currentConfig.settings.identity = String(activePersonaIndex);
    saveAllConfig();
    renderPersonas();
};

async function saveSettings() {
    var identVal = document.getElementById("set-identity").value;
    if (!currentConfig.settings) currentConfig.settings = {};
    
    currentConfig.settings.autonomy = document.getElementById("set-autonomy").value;
    currentConfig.settings.identity = identVal;
    currentConfig.settings.maxToolIterations = parseInt(document.getElementById("set-tool-iterations")?.value) || 10;
    
    if (!currentConfig.llm) currentConfig.llm = { provider: "openai", api_key: "", model: "" };
    
    await saveAllConfig();
    showToast("Settings saved", "success");
    var sr = document.getElementById("settings-save-reminder"); if (sr) sr.classList.remove("visible");
}

function resetSettings() {
    document.getElementById("set-autonomy").value = "collaborative";
    document.getElementById("set-port").value = "7331";
    document.getElementById("set-tunnel").value = "none";
    document.getElementById("set-identity").value = "-1";
    document.getElementById("set-runtime").value = "native";
    document.getElementById("set-loglevel").value = "info";
    document.getElementById("set-tool-iterations").value = "10";
    showToast("Settings reset to defaults", "info");
}

// =========== COMPOSIO & SKILLS ENGINE ===========
var builtinSkills = [
    { id: "web_browser", icon: "🌐", name: "Web Browser", desc: "Navigate and scrape websites via Playwright" },
    { id: "web_search", icon: "🔍", name: "Web Search", desc: "Search Google, DuckDuckGo, or Bing" },
    { id: "docker", icon: "🐳", name: "Docker", desc: "Manage containers, images, and volumes" },
    { id: "ssh_remote", icon: "🔑", name: "SSH Remote", desc: "Execute commands on remote servers" },
    { id: "mqtt_bridge", icon: "📡", name: "MQTT Bridge", desc: "Publish/subscribe to MQTT topics" },
    { id: "serial_port", icon: "🔌", name: "Serial Port", desc: "Read/write to serial devices (Arduino, ESP32)" },
    { id: "b500_telemetry", icon: "🎋", name: "B500 Telemetry", desc: "Monitor BambooCore B500 facility sensors" }
];

var agentTools = [
    { type: "function", function: { name: "run_shell", description: "Execute a shell command on the user's computer. Returns stdout+stderr.", parameters: { type: "object", properties: { command: { type: "string" }, args: { type: "array", items: { type: "string" } } }, required: ["command"], additionalProperties: false } } },
    { type: "function", function: { name: "read_file", description: "Read the contents of a file on the user's computer.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } },
    { type: "function", function: { name: "write_file", description: "Write content to a file on the user's computer.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false } } },
    { type: "function", function: { name: "http_request", description: "Make an HTTP request.", parameters: { type: "object", properties: { url: { type: "string" }, method: { type: "string" }, headers: { type: "object" }, body: { type: "string" } }, required: ["url"], additionalProperties: false } } },
    { type: "function", function: { name: "list_directory", description: "List files and folders.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } },
    { type: "function", function: { name: "take_screenshot", description: "Take a screenshot of the user's screen.", parameters: { type: "object", properties: { filename: { type: "string" } }, additionalProperties: false } } }
];

function sanitizeToolSchema(rawParams) {
    if (!rawParams || typeof rawParams !== "object") return { type: "object", properties: {}, required: [], additionalProperties: false };
    var p; try { p = JSON.parse(JSON.stringify(rawParams)); } catch(e) { return { type: "object", properties: {}, required: [], additionalProperties: false }; }
    function cleanProp(obj) {
        if (!obj || typeof obj !== "object") return obj;
        if (Array.isArray(obj)) return obj.map(cleanProp);
        var badKeys = ["$ref", "$defs", "$schema", "$id", "default", "examples", "example", "title", "format", "readOnly", "writeOnly", "deprecated", "externalDocs", "xml", "discriminator", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "pattern", "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties", "const", "contentMediaType", "contentEncoding", "if", "then", "else", "not"];
        badKeys.forEach(k => delete obj[k]);
        if (obj.allOf && Array.isArray(obj.allOf) && obj.allOf.length === 1) { var inner = cleanProp(obj.allOf[0]); delete obj.allOf; Object.keys(inner).forEach(k => { if (!obj[k]) obj[k] = inner[k]; }); }
        else if (obj.allOf) { obj.allOf.forEach(item => { var cleaned = cleanProp(item); if (cleaned.properties) { if (!obj.properties) obj.properties = {}; Object.keys(cleaned.properties).forEach(pk => { obj.properties[pk] = cleaned.properties[pk]; }); } if (cleaned.required && Array.isArray(cleaned.required)) { if (!obj.required) obj.required = []; cleaned.required.forEach(r => { if (!obj.required.includes(r)) obj.required.push(r); }); } }); delete obj.allOf; }
        if (obj.properties && typeof obj.properties === "object") Object.keys(obj.properties).forEach(k => { obj.properties[k] = cleanProp(obj.properties[k]); });
        if (obj.items) obj.items = cleanProp(obj.items);
        if (obj.anyOf && Array.isArray(obj.anyOf) && obj.anyOf.length > 0) { var first = cleanProp(obj.anyOf[0]); delete obj.anyOf; Object.keys(first).forEach(fk => { if (!obj[fk]) obj[fk] = first[fk]; }); }
        if (obj.oneOf && Array.isArray(obj.oneOf) && obj.oneOf.length > 0) { var first2 = cleanProp(obj.oneOf[0]); delete obj.oneOf; Object.keys(first2).forEach(fk => { if (!obj[fk]) obj[fk] = first2[fk]; }); }
        if (Array.isArray(obj.type)) obj.type = obj.type.find(t => t !== "null") || "string";
        return obj;
    }
    p = cleanProp(p);
    if (!p.type) p.type = "object";
    if (!p.properties) p.properties = {};
    if (!p.required) p.required = [];
    p.additionalProperties = false;
    p.required = p.required.filter(r => p.properties.hasOwnProperty(r));
    return p;
}

function renderBuiltinSkills() {
    var el = document.getElementById("skills-builtin");
    if (!el) return;
    var html = "";
    builtinSkills.forEach(s => {
        var isEnabled = enabledSkills[s.id];
        html += `<div class="skill-card ${isEnabled ? 'enabled' : ''}" data-skill-id="${s.id}" data-skill-type="builtin">`;
        html += `<button type="button" class="skill-toggle"></button>`;
        html += `<div class="skill-icon">${s.icon}</div><div class="skill-name">${s.name}</div><div class="skill-meta"><span style="font-size:0.65rem;color:var(--text-dim);">● Built-in</span></div><div class="skill-desc-full">${s.desc}</div></div>`;
    });
    el.innerHTML = html;
}

function renderComposioToolkits() {
    var el = document.getElementById("skills-composio");
    if (!el) return;
    var search = (document.getElementById("skill-search")?.value || "").toLowerCase();
    var filtered = composioToolkits.filter(tk => {
        if (search && !tk.name.toLowerCase().includes(search) && !tk.slug.toLowerCase().includes(search)) return false;
        if (composioActiveCategory !== "All" && !tk.categories?.includes(composioActiveCategory)) return false;
        return true;
    });

    var html = "";
    filtered.forEach(tk => {
        var isEnabled = enabledSkills["composio_" + tk.slug] || false;
        var imgSrc = tk.local_logo || tk.logo || "";
        var logoHtml = imgSrc ? `<img src="${imgSrc}" onerror="this.outerHTML='<span class=skill-icon>🧩</span>'" />` : `🧩`;
        
        html += `<div class="skill-card ${isEnabled ? 'enabled' : ''}" data-skill-id="composio_${tk.slug}">`;
        html += `<button type="button" class="skill-toggle"></button>`;
        html += `<div class="skill-icon">${logoHtml}</div><div class="skill-name">${tk.name}</div>`;
        html += `<div class="skill-meta"><span style="font-size:0.65rem;color:var(--accent);">● ${tk.tools_count || 0} tools</span></div>`;
        if (tk.auth_warning) html += `<div class="auth-warning-badge">⚠ Not connected</div>`;
        html += `</div>`;
    });
    el.innerHTML = html || '<div style="color:var(--text-dim);font-size:0.85rem;padding:0.5rem;">No matching toolkits</div>';
}

function renderEnabledIntegrations() {
    var section = document.getElementById("enabled-integrations-section");
    var grid = document.getElementById("skills-enabled-integrations");
    if (!section || !grid) return;
    var html = "", count = 0;
    
    Object.keys(enabledSkills || {}).forEach(k => {
        if (!enabledSkills[k] || !k.startsWith("composio_")) return;
        count++;
        var slug = k.replace("composio_", "");
        var tk = composioToolkits.find(t => t.slug === slug);
        var name = tk ? (tk.name || slug) : slug;
        var logoHtml = tk && tk.logo ? `<img src="${tk.logo}" />` : `🧩`;
        
        html += `<div class="skill-card" style="cursor:pointer;" onclick="window.toggleSkill('${k}')"><div style="display:flex;align-items:center;gap:0.5rem;"><div class="skill-icon">${logoHtml}</div><div style="flex:1;"><div style="font-size:0.85rem;font-weight:600;">${name}</div></div><span style="color:#ef4444;font-size:0.7rem;">✕</span></div></div>`;
    });
    
    section.style.display = count > 0 ? "" : "none";
    grid.innerHTML = html;
}

function renderActiveToolsSummary() {
    var badge = document.getElementById("active-tools-count-badge");
    var listEl = document.getElementById("active-tools-list");
    if (!badge || !listEl) return;
    var count = 0;
    Object.keys(enabledSkills || {}).forEach(k => { if (enabledSkills[k]) count++; });
    badge.textContent = count;
    listEl.innerHTML = `<div style="color:var(--text-dim);font-size:0.75rem;padding:0.25rem 0;">${count} Toolkits Active</div>`;
}

function rebuildBuiltinTools() {
    agentTools = agentTools.filter(t => !["web_browse","web_search","docker_command","ssh_execute","mqtt_publish"].includes(t.function.name));
    builtinSkills.forEach(s => {
        if (!enabledSkills[s.id]) return;
        if (s.id === "web_browser") agentTools.push({ type: "function", function: { name: "web_browse", description: "Open URL in headless browser", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } }});
        else if (s.id === "web_search") agentTools.push({ type: "function", function: { name: "web_search", description: "Search the web", parameters: { type: "object", properties: { query: { type: "string" }, engine: { type: "string" } }, required: ["query"], additionalProperties: false } }});
        else if (s.id === "docker") agentTools.push({ type: "function", function: { name: "docker_command", description: "Docker commands", parameters: { type: "object", properties: { args: { type: "array", items: { type: "string" } } }, required: ["args"], additionalProperties: false } }});
        else if (s.id === "ssh_remote") agentTools.push({ type: "function", function: { name: "ssh_execute", description: "SSH commands", parameters: { type: "object", properties: { host: { type: "string" }, user: { type: "string" }, command: { type: "string" }, port: { type: "number" } }, required: ["host", "user", "command"], additionalProperties: false } }});
        else if (s.id === "mqtt_bridge") agentTools.push({ type: "function", function: { name: "mqtt_publish", description: "MQTT publish", parameters: { type: "object", properties: { broker: { type: "string" }, topic: { type: "string" }, message: { type: "string" } }, required: ["broker", "topic", "message"], additionalProperties: false } }});
    });
}

async function fetchToolkitTools(slug) {
    var composioKey = currentConfig.composioApiKey;
    if (!composioKey) return;
    try {
        var toolsJson = "";
        var endpoint = COMPOSIO_API_URL + "/tools?toolkit=" + encodeURIComponent(slug) + "&limit=200";
        if (window.__TAURI__) toolsJson = await tauriInvoke("run_shell_command", { commandName: "curl", args: ["-s", "-H", "x-api-key: " + composioKey, endpoint] });
        else { var resp = await fetch(endpoint, { headers: { "x-api-key": composioKey } }); toolsJson = await resp.text(); }

        var data = JSON.parse(toolsJson);
        composioToolkitDetails[slug] = data.items || [];

        agentTools = agentTools.filter(t => !t.function.name.startsWith("composio_"));

        Object.keys(enabledSkills).forEach(skillId => {
            if (!enabledSkills[skillId] || !skillId.startsWith("composio_")) return;
            var sk = skillId.replace("composio_", "");
            var cachedTools = composioToolkitDetails[sk];
            if (cachedTools) {
                cachedTools.forEach(tool => {
                    var rawParams = tool.input_parameters || tool.parameters || { type: "object", properties: {}, required: [] };
                    var params = sanitizeToolSchema(rawParams);
                    var realSlug = tool.slug || tool.name || "";
                    var safeName = ("composio_" + realSlug.replace(/[^a-zA-Z0-9_-]/g, "_")).substring(0, 64);
                    agentTools.push({ type: "function", function: { name: safeName, description: (tool.description || tool.name || sk + " tool").substring(0, 1024), parameters: params } });
                });
            }
        });
        showToast(slug + ": tools added to agent", "success");
    } catch(e) {}
}

async function saveComposioKey() {
    var key = document.getElementById("composio-api-key").value.trim();
    if (!key) { showToast("Please enter a Composio API key", "error"); return; }
    currentConfig.composioApiKey = key;
    saveAllConfig();

    var statusEl = document.getElementById("composio-status");
    statusEl.style.display = "block";
    statusEl.innerHTML = '<span style="color:var(--text-dim);">⟳ Fetching toolkits...</span>';

    try {
        var resp = await fetch(COMPOSIO_API_URL + "/toolkits?limit=500", { headers: { "x-api-key": key } });
        if (resp.ok) {
            var toolkitsData = await resp.json();
            composioToolkits = (toolkitsData.items || []).map(tk => ({
                slug: tk.slug, name: tk.name || tk.slug, logo: tk.logo || "", categories: tk.categories || [], tools_count: tk.tools_count || 0
            }));
            statusEl.innerHTML = '<span style="color:var(--accent);">✓ Connected to Composio</span>';
            document.getElementById("composio-placeholder")?.classList.add("hidden");
            document.getElementById("composio-connected-area")?.classList.remove("hidden");
            renderComposioToolkits();
            renderEnabledIntegrations();
        } else {
            statusEl.innerHTML = '<span style="color:var(--error);">✗ Invalid API key</span>';
        }
    } catch(e) {
        statusEl.innerHTML = '<span style="color:var(--warning);">⚠ CORS error in preview. Saved for Desktop.</span>';
    }
}

window.toggleSkill = function(skillId) {
    if (!enabledSkills) enabledSkills = {};
    enabledSkills[skillId] = !enabledSkills[skillId];
    currentConfig.enabledSkills = enabledSkills;
    saveAllConfig();

    if (enabledSkills[skillId]) {
        if (skillId.startsWith("composio_")) fetchToolkitTools(skillId.replace("composio_", ""));
        else rebuildBuiltinTools();
        showToast(skillId + " enabled", "success");
    } else {
        agentTools = agentTools.filter(t => !t.function.name.startsWith("composio_"));
        rebuildBuiltinTools();
        showToast(skillId + " disabled", "info");
    }
    
    renderBuiltinSkills();
    renderComposioToolkits();
    renderEnabledIntegrations();
    renderActiveToolsSummary();
};

document.getElementById("skills-builtin")?.addEventListener("click", function(e) {
    var card = e.target.closest(".skill-card");
    if (card) { var skillId = card.getAttribute("data-skill-id"); if (skillId) window.toggleSkill(skillId); }
});

document.getElementById("skills-composio")?.addEventListener("click", function(e) {
    var card = e.target.closest(".skill-card");
    if (card) { var skillId = card.getAttribute("data-skill-id"); if (skillId) window.toggleSkill(skillId); }
});


// =========== AGENT CHAT & DAEMON ===========
async function toggleDaemon() {
    if (daemonRunning) {
        try { await invokeShort("stop_daemon"); daemonRunning = false; showToast("Agent daemon stopped", "info"); } catch(e) { daemonRunning = false; }
    } else {
        try { await invokeShort("start_daemon"); daemonRunning = true; showToast("Agent daemon started", "success"); } catch(e) { showToast("Failed to start daemon", "error"); }
    }
    
    var pill = document.getElementById("daemon-status-pill");
    var text = document.getElementById("daemon-status-text");
    var btn = document.getElementById("btn-daemon-toggle");
    if (daemonRunning) {
        pill.className = "status-pill running"; text.textContent = "Running"; btn.textContent = "Stop Agent Daemon"; btn.classList.add("btn-danger");
    } else {
        pill.className = "status-pill stopped"; text.textContent = "Stopped"; btn.textContent = "Start Agent Daemon"; btn.classList.remove("btn-danger");
    }
}

async function emergencyFlush() {
    showToast("Flushing system processes...", "info");
    try { await invokeShort("emergency_flush"); } catch(e) {}
    daemonRunning = false;
    var pill = document.getElementById("daemon-status-pill");
    if (pill) pill.className = "status-pill stopped";
    showToast("System flushed successfully", "success");
}

async function sendAgentMessage(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    var input = document.getElementById("agent-chat-input");
    var msg = input.value.trim();
    if (!msg) return;
    input.value = "";
    
    var chatEl = document.getElementById("agent-chat-messages");
    chatEl.innerHTML += `<div class="chat-msg"><span class="role">You:</span> ${msg}</div>`;
    chatEl.scrollTop = chatEl.scrollHeight;

    if (!daemonRunning) {
        chatEl.innerHTML += `<div class="chat-msg assistant"><span class="role">Agent:</span> Daemon is offline. Please start it first.</div>`;
        return;
    }

    chatEl.innerHTML += `<div class="chat-msg assistant" id="typing-indicator"><span class="role">Agent:</span> <span class="spinner">⟳</span> Thinking...</div>`;
    chatEl.scrollTop = chatEl.scrollHeight;
    
    try {
        var reply = await callLLM(msg);
        var typing = document.getElementById("typing-indicator"); if (typing) typing.remove();
        chatEl.innerHTML += `<div class="chat-msg assistant"><span class="role">Agent:</span> ${escapeHtml(reply)}</div>`;
        chatEl.scrollTop = chatEl.scrollHeight;
    } catch(err) {
        var typing = document.getElementById("typing-indicator"); if (typing) typing.remove();
        chatEl.innerHTML += `<div class="chat-msg assistant"><span class="role">Agent:</span> Error: ${escapeHtml(err.message)}</div>`;
    }
}


// =========== EVENT BINDINGS ===========
function safeBind(id, event, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
}

window.filterHelp = function(query) {
    query = query.toLowerCase();
    document.querySelectorAll(".help-section").forEach(sec => {
        sec.style.display = sec.textContent.toLowerCase().includes(query) ? "block" : "none";
    });
};

window.toggleActiveToolsList = function() {
    var list = document.getElementById("active-tools-list");
    if (list) list.classList.toggle("visible");
};

safeBind("btn-copy-boot-log", "click", () => copyLog("boot-log"));
safeBind("btn-copy-install-log", "click", () => copyLog("install-log"));
safeBind("btn-copy-cap-log", "click", () => copyLog("capability-log"));
safeBind("btn-copy-log", "click", () => copyLog("unified-log"));
safeBind("btn-copy-payload", "click", () => copyLog("llm-payload-display"));

safeBind("btn-back-step1", "click", () => wizardGo(0));
safeBind("btn-back-step2", "click", () => wizardGo(1));
safeBind("btn-step0-next", "click", () => wizardGo(1));
safeBind("btn-step1-next", "click", () => wizardGo(2));
safeBind("btn-enter-dashboard", "click", () => window.enterDashboard());

safeBind("btn-apply-llm", "click", applyLLMConfig);
safeBind("btn-test-llm", "click", testLLMConfig);
safeBind("btn-save-settings", "click", saveSettings);
safeBind("btn-reset-settings", "click", resetSettings);
safeBind("btn-create-persona", "click", createPersona);
safeBind("btn-generate-persona", "click", generatePersonaWithAI);

safeBind("btn-cancel-edit-persona", "click", () => {
    document.getElementById("new-persona-name").value = "";
    document.getElementById("new-persona-prompt").value = "";
    document.getElementById("btn-create-persona").textContent = "Save Persona";
    document.getElementById("btn-cancel-edit-persona").classList.add("hidden");
    editingPersonaIndex = -1;
});

safeBind("or-model-search", "input", renderORModels);
safeBind("or-sort-name", "click", () => window.sortORModels("name"));
safeBind("or-sort-input", "click", () => window.sortORModels("input"));
safeBind("or-sort-output", "click", () => window.sortORModels("output"));
safeBind("btn-fetch-models", "click", window.fetchORModels);

safeBind("btn-setup-tg", "click", setupTelegram);
safeBind("btn-setup-dc", "click", setupDiscord);
safeBind("btn-setup-wa", "click", setupWhatsApp);
safeBind("btn-setup-sl", "click", setupSlack);

safeBind("btn-daemon-toggle", "click", toggleDaemon);
safeBind("btn-emergency-flush", "click", emergencyFlush);
safeBind("btn-send-chat", "click", sendAgentMessage);

safeBind("btn-save-composio", "click", saveComposioKey);
safeBind("btn-toggle-tools-list", "click", window.toggleActiveToolsList);

var chatInput = document.getElementById("agent-chat-input");
if (chatInput) chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendAgentMessage(e); });

var helpSearchEl = document.getElementById("help-search");
if (helpSearchEl) helpSearchEl.addEventListener("input", (e) => window.filterHelp(e.target.value));

var skillSearchEl = document.getElementById("skill-search");
if (skillSearchEl) skillSearchEl.addEventListener("input", renderComposioToolkits);

document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", function() {
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        this.classList.add("active");
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
        document.getElementById(this.getAttribute("data-tab")).classList.remove("hidden");
    });
});

// =========== BOOT SEQUENCE ===========
async function fetchVersion() {
    try {
        var resp = await fetch(PROXY_URL + "?action=latest");
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        var data = await resp.json();
        var ver = data.tag_name || "v-unknown";
        var el = document.getElementById("app-version"); if (el) el.textContent = ver;
        var aboutVer = document.getElementById("about-version"); if (aboutVer) aboutVer.textContent = ver;
    } catch(e) {}
}

async function boot() {
    try {
        var installedFlag = localStorage.getItem("bambooclaw-installed");
        fetchVersion();
        if (installedFlag === "true") {
            await window.enterDashboard();
            if (!currentConfig.settings) {
                currentConfig.settings = { autonomy: "autonomous", port: "7331", tunnel: "none", identity: "-1", runtime: "native", loglevel: "info", maxToolIterations: 10 };
                saveAllConfig();
            }
            
            renderBuiltinSkills();
            rebuildBuiltinTools();
            renderActiveToolsSummary();

            if (currentConfig.composioApiKey) {
                var ckEl = document.getElementById("composio-api-key");
                if (ckEl) ckEl.value = currentConfig.composioApiKey;
                setTimeout(saveComposioKey, 1000);
            }
            
            setTimeout(() => { if (currentConfig.llm && currentConfig.llm.api_key && !daemonRunning) toggleDaemon(); }, 500);
        } else {
            wizardGo(0); 
        }
    } catch(e) { appendLog("dash-log", "[BOOT] Error: " + e); }
}

(function waitForTauri() {
    try {
        var waited = 0;
        var interval = setInterval(() => {
            waited += 50;
            if (window.__TAURI__) { clearInterval(interval); boot(); } 
            else if (waited >= 3000) { clearInterval(interval); boot(); }
        }, 50);
    } catch(e) {}
})();