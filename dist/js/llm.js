// =========== LLM PROVIDER MODELS ===========
var providerModels = {
    openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1-preview", "o1-mini"],
    anthropic: ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-3.5-sonnet-20241022", "claude-3-haiku-20240307"],
    google: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
    groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    ollama: ["llama3.2", "llama3.1", "mistral", "codellama", "phi3", "qwen2.5", "deepseek-r1"],
    lmstudio: ["(auto-detected from server)"],
    jan: ["(auto-detected from server)"],
    deepseek: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
    mistral: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "codestral-latest"],
    inception: ["mercury-2"]
};

var LOCAL_PROVIDERS = ["ollama", "lmstudio", "jan"];
var LOCAL_DEFAULTS = { ollama: "http://localhost:11434", lmstudio: "http://localhost:1234", jan: "http://localhost:1337" };

var orModels = [];
var orSortKey = "name";
var orSortDir = 1;
var orSelectedModel = "";

async function autoFetchModels(provider, apiKey) {
    var isLocal = LOCAL_PROVIDERS.includes(provider);
    if (!apiKey && !isLocal) return;
    var sel = document.getElementById("llm-model");
    if (!sel) return;

    sel.innerHTML = '<option value="">⟳ Fetching active models...</option>';

    // Determine base URL
    var localUrlEl = document.getElementById("llm-local-url");
    var baseUrl = (localUrlEl && localUrlEl.value.trim()) || LOCAL_DEFAULTS[provider] || "";

    var url = "";
    var fetchHeaders = {};

    if (provider === "ollama") {
        url = baseUrl + "/api/tags";
    } else if (provider === "lmstudio" || provider === "jan") {
        // Both speak OpenAI-compatible /v1/models
        url = baseUrl + "/v1/models";
    } else if (provider === "google") {
        url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey;
    } else if (["openai","groq","deepseek","mistral","inception"].includes(provider)) {
        var bases = {
            openai: "https://api.openai.com/v1/models",
            groq: "https://api.groq.com/openai/v1/models",
            deepseek: "https://api.deepseek.com/models",
            mistral: "https://api.mistral.ai/v1/models",
            inception: "https://api.inceptionlabs.ai/v1/models"
        };
        url = bases[provider];
        fetchHeaders["Authorization"] = "Bearer " + apiKey;
    } else if (provider === "anthropic") {
        url = "https://api.anthropic.com/v1/models";
        fetchHeaders["x-api-key"] = apiKey;
        fetchHeaders["anthropic-version"] = "2023-06-01";
    }

    if (!url) {
        // Fallback to static list
        sel.innerHTML = "";
        (providerModels[provider] || []).forEach(function(m) {
            var opt = document.createElement("option"); opt.value = m; opt.textContent = m; sel.appendChild(opt);
        });
        return;
    }

    try {
        var resp = await fetch(url, { headers: fetchHeaders });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        var data = await resp.json();
        var models = [];

        if (provider === "ollama" && data.models) {
            models = data.models.map(function(m) { return m.name; });
        } else if (provider === "google" && data.models) {
            models = data.models.filter(function(m) {
                return m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent");
            }).map(function(m) { return m.name.replace("models/", ""); });
        } else if (data.data) {
            // OpenAI-compatible (lmstudio, jan, openai, groq, etc.)
            models = data.data.map(function(m) { return m.id; });
        }

        if (models.length > 0) {
            sel.innerHTML = "";
            models.sort().forEach(function(m) {
                var opt = document.createElement("option"); opt.value = m; opt.textContent = m; sel.appendChild(opt);
            });
            if (currentConfig.llm && currentConfig.llm.provider === provider && currentConfig.llm.model) {
                sel.value = currentConfig.llm.model;
            }
            return;
        }
    } catch(e) {
        appendLog("dash-log", "[LLM] Model fetch failed for " + provider + ": " + (e.message || e));
    }

    // Fallback to static list
    sel.innerHTML = "";
    (providerModels[provider] || []).forEach(function(m) {
        var opt = document.createElement("option"); opt.value = m; opt.textContent = m; sel.appendChild(opt);
    });
    if (currentConfig.llm && currentConfig.llm.provider === provider && currentConfig.llm.model) {
        sel.value = currentConfig.llm.model;
    }
}

// =========== LLM CONFIG APPLY / TEST ===========
async function applyLLMConfig() {
    appendLog("dash-log", "[LLM] applyLLMConfig() called");
    var provider = document.getElementById("llm-provider").value;
    var apiKey = document.getElementById("llm-api-key").value.trim();
    var model = provider === "openrouter" ? orSelectedModel : document.getElementById("llm-model").value;
    var isLocal = LOCAL_PROVIDERS.includes(provider);
    var localUrlEl = document.getElementById("llm-local-url");
    var localUrl = (localUrlEl && localUrlEl.value.trim()) || LOCAL_DEFAULTS[provider] || "";

    if (!apiKey && !isLocal) {
        showToast("API key is required for " + provider, "error");
        return;
    }
    if (provider === "openrouter" && !model) {
        showToast("Please select a model from the list first", "error");
        return;
    }

    // Preserve existing per-provider keys, just update the active provider's entry
    if (!currentConfig.llm) currentConfig.llm = {};
    if (!currentConfig.llm.api_keys) currentConfig.llm.api_keys = {};
    if (!currentConfig.llm.local_urls) currentConfig.llm.local_urls = {};
    currentConfig.llm.provider = provider;
    currentConfig.llm.model = model;
    if (apiKey) currentConfig.llm.api_keys[provider] = apiKey;
    if (localUrl) currentConfig.llm.local_urls[provider] = localUrl;
    // Keep api_key in sync for the Rust daemon (active provider's key)
    currentConfig.llm.api_key = apiKey || currentConfig.llm.api_keys[provider] || "";
    currentConfig.llm.local_url = localUrl;

    var tomlContent = buildConfigToml();

    try {
        await invokeShort("write_config", { content: tomlContent });
        showToast("Configuration saved to ~/.bambooclaw/config.toml", "success");
    } catch(e) {
        localStorage.setItem("bambooclaw-config", JSON.stringify(currentConfig));
        showToast("Configuration saved successfully", "success");
    }
    var r1 = document.getElementById("or-save-reminder"); if (r1) r1.classList.remove("visible");
    var r2 = document.getElementById("llm-save-reminder"); if (r2) r2.classList.remove("visible");
}

async function testLLMConfig() {
    var provider = document.getElementById("llm-provider").value;
    var apiKey = document.getElementById("llm-api-key").value.trim();
    var isLocal = LOCAL_PROVIDERS.includes(provider);
    var localUrlEl = document.getElementById("llm-local-url");
    var baseUrl = (localUrlEl && localUrlEl.value.trim()) || LOCAL_DEFAULTS[provider] || "";

    if (!apiKey && !isLocal) { showToast("Enter an API key first", "error"); return; }
    showToast("Testing connection...", "info");
    try {
        if (provider === "openrouter") {
            var resp = await fetch("https://openrouter.ai/api/v1/models", { headers: { "Authorization": "Bearer " + apiKey } });
            showToast(resp.ok ? "OpenRouter API key is valid!" : "Invalid API key (HTTP " + resp.status + ")", resp.ok ? "success" : "error");
        } else if (provider === "ollama") {
            var resp2 = await fetch(baseUrl + "/api/tags");
            showToast(resp2.ok ? "Ollama is running at " + baseUrl : "Ollama not reachable at " + baseUrl, resp2.ok ? "success" : "error");
        } else if (provider === "lmstudio") {
            var resp3 = await fetch(baseUrl + "/v1/models");
            showToast(resp3.ok ? "LM Studio is running at " + baseUrl : "LM Studio not reachable at " + baseUrl, resp3.ok ? "success" : "error");
        } else if (provider === "jan") {
            var resp4 = await fetch(baseUrl + "/v1/models");
            showToast(resp4.ok ? "Jan is running at " + baseUrl : "Jan not reachable at " + baseUrl, resp4.ok ? "success" : "error");
        } else {
            showToast("Key saved. Full connection test available when agent daemon is running.", "info");
        }
    } catch(e) {
        showToast("Connection test error: " + (e.message || e), "error");
    }
}

// =========== OPENROUTER MODEL LIST ===========
window.fetchORModels = function() {
    var listEl = document.getElementById("or-model-list");
    if (!listEl) return;
    listEl.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-dim);"><span class="spinner">⟳</span> Loading models...</div>';
    fetch("https://openrouter.ai/api/v1/models")
    .then(function(r) { return r.json(); })
    .then(function(data) {
        var seen = {};
        orModels = (data.data || []).filter(function(m) {
            if (!m.name || !m.pricing || !m.id || seen[m.id] || m.name === m.id) return false;
            seen[m.id] = true;
            return true;
        }).map(function(m) {
            return { id: m.id, name: m.name, input: parseFloat(m.pricing.prompt || "0"), output: parseFloat(m.pricing.completion || "0") };
        });
        document.getElementById("or-model-count").textContent = "(" + orModels.length + " available)";
        renderORModels();
    })
    .catch(function() {
        listEl.innerHTML = '<div style="padding:1rem;color:var(--error);text-align:center;">Failed to load models</div>';
    });
};

window.sortORModels = function(key) {
    if (orSortKey === key) { orSortDir *= -1; } else { orSortKey = key; orSortDir = 1; }
    renderORModels();
};

window.selectORModel = function(id) {
    orSelectedModel = id;
    var m = orModels.find(function(x) { return x.id === id; });
    var nameEl = document.getElementById("or-active-model-name");
    if (nameEl) nameEl.textContent = m ? m.name + " (" + m.id + ")" : id;
    var reminder = document.getElementById("or-save-reminder");
    if (reminder) reminder.classList.add("visible");
    var sel = document.getElementById("llm-model");
    sel.innerHTML = "";
    var opt = document.createElement("option");
    opt.value = id;
    opt.textContent = m ? m.name : id;
    sel.appendChild(opt);
    sel.value = id;
    renderORModels();
};

function renderORModels() {
    var searchEl = document.getElementById("or-model-search");
    var search = searchEl ? searchEl.value.toLowerCase() : "";
    var filtered = orModels.filter(function(m) {
        return m.id.toLowerCase().indexOf(search) >= 0 || m.name.toLowerCase().indexOf(search) >= 0;
    });
    filtered.sort(function(a, b) {
        var cmp = 0;
        if (orSortKey === "name") cmp = a.name.localeCompare(b.name);
        else if (orSortKey === "input") cmp = a.input - b.input;
        else if (orSortKey === "output") cmp = a.output - b.output;
        return cmp * orSortDir;
    });

    var html = '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;">';
    html += '<thead><tr style="background:#1a1a2e;position:sticky;top:0;">';
    html += '<th style="text-align:left;padding:0.5rem 0.75rem;">Model</th><th style="text-align:right;padding:0.5rem 0.75rem;">Input</th><th style="text-align:right;padding:0.5rem 0.75rem;">Output</th>';
    html += '</tr></thead><tbody>';
    filtered.forEach(function(m) {
        var sel = m.id === orSelectedModel;
        var bg = sel ? "background:rgba(16,185,129,0.15);border-left:3px solid var(--accent);" : "border-left:3px solid transparent;";
        html += '<tr data-model-id="' + escapeHtml(m.id) + '" style="cursor:pointer;border-bottom:1px solid var(--border);' + bg + '" class="or-model-row">';
        html += '<td style="padding:0.5rem 0.75rem;"><div style="font-weight:600;">' + escapeHtml(m.name) + '</div><div style="color:var(--text-dim);font-size:0.7rem;">' + escapeHtml(m.id) + '</div></td>';
        html += '<td style="text-align:right;padding:0.5rem 0.75rem;font-family:monospace;">$' + (m.input*1000000).toFixed(2) + '</td>';
        html += '<td style="text-align:right;padding:0.5rem 0.75rem;font-family:monospace;">$' + (m.output*1000000).toFixed(2) + '</td>';
        html += '</tr>';
    });
    html += '</tbody></table>';
    var listEl = document.getElementById("or-model-list");
    if (listEl) listEl.innerHTML = html;
}

async function fetchVersion() {
    try {
        var resp = await fetch(PROXY_URL + "?action=latest");
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        var data = await resp.json();
        var ver = data.tag_name || "v-unknown";
        var el = document.getElementById("app-version");
        if (el) el.textContent = ver;
        var aboutVer = document.getElementById("about-version");
        if (aboutVer) aboutVer.textContent = ver;
    } catch(e) {}
}