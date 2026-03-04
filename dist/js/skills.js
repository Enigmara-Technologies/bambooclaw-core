// =========== SKILLS / COMPOSIO ===========
var COMPOSIO_API_URL = "https://backend.composio.dev/api/v3";
var enabledSkills = {};
var composioTools = [];
var composioToolkits = [];
var composioToolkitDetails = {};
var composioCategories = ["All"];
var composioActiveCategory = "All";
var logosDir = "";

function sanitizeToolSchema(rawParams) {
    if (!rawParams || typeof rawParams !== "object") return { type: "object", properties: {}, required: [], additionalProperties: false };
    var p;
    try { p = JSON.parse(JSON.stringify(rawParams)); } catch(e) { return { type: "object", properties: {}, required: [], additionalProperties: false }; }

    function cleanProp(obj) {
        if (!obj || typeof obj !== "object") return obj;
        if (Array.isArray(obj)) return obj.map(cleanProp);
        var badKeys = ["$ref","$defs","$schema","$id","default","examples","example","title","format","readOnly","writeOnly","deprecated","externalDocs","xml","discriminator","minLength","maxLength","minimum","maximum","exclusiveMinimum","exclusiveMaximum","multipleOf","pattern","minItems","maxItems","uniqueItems","minProperties","maxProperties","const","contentMediaType","contentEncoding","if","then","else","not"];
        badKeys.forEach(function(k) { delete obj[k]; });
        if (obj.allOf && Array.isArray(obj.allOf) && obj.allOf.length === 1) {
            var inner = cleanProp(obj.allOf[0]); delete obj.allOf;
            Object.keys(inner).forEach(function(k) { if (!obj[k]) obj[k] = inner[k]; });
        } else if (obj.allOf) {
            obj.allOf.forEach(function(item) {
                var cleaned = cleanProp(item);
                if (cleaned.properties) { if (!obj.properties) obj.properties = {}; Object.keys(cleaned.properties).forEach(function(pk) { obj.properties[pk] = cleaned.properties[pk]; }); }
                if (cleaned.required && Array.isArray(cleaned.required)) { if (!obj.required) obj.required = []; cleaned.required.forEach(function(r) { if (obj.required.indexOf(r) < 0) obj.required.push(r); }); }
            });
            delete obj.allOf;
        }
        if (obj.properties) Object.keys(obj.properties).forEach(function(k) { obj.properties[k] = cleanProp(obj.properties[k]); });
        if (obj.items) obj.items = cleanProp(obj.items);
        if (obj.anyOf && Array.isArray(obj.anyOf) && obj.anyOf.length > 0) { var f1 = cleanProp(obj.anyOf[0]); delete obj.anyOf; Object.keys(f1).forEach(function(fk) { if (!obj[fk]) obj[fk] = f1[fk]; }); }
        if (obj.oneOf && Array.isArray(obj.oneOf) && obj.oneOf.length > 0) { var f2 = cleanProp(obj.oneOf[0]); delete obj.oneOf; Object.keys(f2).forEach(function(fk) { if (!obj[fk]) obj[fk] = f2[fk]; }); }
        if (Array.isArray(obj.type)) obj.type = obj.type.find(function(t) { return t !== "null"; }) || "string";
        return obj;
    }

    p = cleanProp(p);
    if (!p.type) p.type = "object";
    if (!p.properties) p.properties = {};
    if (!p.required) p.required = [];
    p.additionalProperties = false;
    p.required = p.required.filter(function(r) { return p.properties.hasOwnProperty(r); });
    return p;
}

function renderActiveToolsSummary() {
    var badge = document.getElementById("active-tools-count-badge");
    var listEl = document.getElementById("active-tools-list");
    if (!badge || !listEl) return;
    var enabledCount = 0, html = "";
    Object.keys(enabledSkills).forEach(function(k) {
        if (!enabledSkills[k]) return;
        enabledCount++;
        var isComposio = k.startsWith("composio_");
        var label = isComposio ? k.replace("composio_", "") : k;
        var toolCount = 0;
        agentTools.forEach(function(t) { if (isComposio ? t.function.name.indexOf(k.replace("composio_","")) > -1 : (t._source === k || t.function.name === k)) toolCount++; });
        html += '<div class="active-tool-entry"><span class="tool-dot ' + (isComposio ? "composio" : "builtin") + '"></span>' + escapeHtml(label) + (toolCount > 0 ? '<span style="color:var(--text-dim);font-size:0.7rem;margin-left:0.3rem;"> (' + toolCount + ' tools)</span>' : '') + '</div>';
    });
    badge.textContent = enabledCount;
    listEl.innerHTML = html || '<div style="color:var(--text-dim);font-size:0.75rem;padding:0.25rem 0;">No tools loaded</div>';
}

async function checkComposioConnection(slug) {
    var composioKey = currentConfig.composioApiKey;
    if (!composioKey) return;
    try {
        var endpoint = COMPOSIO_API_URL + "/connected_accounts?toolkit=" + encodeURIComponent(slug);
        var resultJson = window.__TAURI__ ? await tauriInvoke("run_shell_command", { commandName: "curl", args: ["-s", "-H", "x-api-key: " + composioKey, endpoint] }) : await (await fetch(endpoint, { headers: { "x-api-key": composioKey } })).text();
        var data = JSON.parse(resultJson);
        var accounts = data.items || data.results || (Array.isArray(data) ? data : []);
        for (var i = 0; i < composioToolkits.length; i++) {
            if (composioToolkits[i].slug === slug) { composioToolkits[i].auth_warning = accounts.length === 0; break; }
        }
        renderComposioToolkits();
    } catch(e) {}
}

// Connection modal uses DOM methods (no inline onclick) so the eye icon works correctly
function showConnectionModal(slug) {
    var existing = document.getElementById("conn-modal-overlay");
    if (existing) existing.remove();

    var tk = composioToolkits.find(function(t) { return t.slug === slug; });
    var name = tk ? (tk.meta_name || tk.name || slug) : slug;

    var overlay = document.createElement("div");
    overlay.id = "conn-modal-overlay";
    overlay.className = "conn-modal-overlay visible";

    var modal = document.createElement("div");
    modal.className = "conn-modal";

    var h3 = document.createElement("h3");
    h3.textContent = "Connect " + name;
    modal.appendChild(h3);

    var p = document.createElement("p");
    p.textContent = "Link your " + name + " account so the agent can use its tools on your behalf.";
    modal.appendChild(p);

    var lbl = document.createElement("label");
    lbl.setAttribute("for", "conn-api-key");
    lbl.textContent = "API Key / Access Token";
    modal.appendChild(lbl);

    var pwField = buildPasswordField("conn-api-key", "Paste your API key or token here");
    pwField.style.marginBottom = "0.75rem";
    modal.appendChild(pwField);

    var actionsDiv = document.createElement("div");
    actionsDiv.className = "conn-modal-actions";
    actionsDiv.style.marginBottom = "0.75rem";
    var saveKeyBtn = document.createElement("button");
    saveKeyBtn.className = "btn-connect";
    saveKeyBtn.textContent = "Connect with API Key";
    saveKeyBtn.addEventListener("click", function() { handleConnectWithApiKey(slug, overlay); });
    actionsDiv.appendChild(saveKeyBtn);
    modal.appendChild(actionsDiv);

    var orDiv = document.createElement("div");
    orDiv.className = "conn-or";
    orDiv.textContent = "— or —";
    modal.appendChild(orDiv);

    var oauthBtn = document.createElement("button");
    oauthBtn.className = "btn-oauth";
    oauthBtn.textContent = "🔗 Connect via OAuth (opens browser)";
    oauthBtn.addEventListener("click", function() { overlay.remove(); performComposioOAuth(slug); });
    modal.appendChild(oauthBtn);

    var cancelDiv = document.createElement("div");
    cancelDiv.className = "conn-modal-actions";
    cancelDiv.style.marginTop = "1rem";
    var cancelBtn = document.createElement("button");
    cancelBtn.className = "btn-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", function() { overlay.remove(); });
    cancelDiv.appendChild(cancelBtn);
    modal.appendChild(cancelDiv);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

async function handleConnectWithApiKey(slug, overlay) {
    var apiKeyInput = document.getElementById("conn-api-key");
    var key = apiKeyInput ? apiKeyInput.value.trim() : "";
    if (!key) { showToast("Please enter an API key or token", "error"); return; }
    var composioKey = currentConfig.composioApiKey;
    if (!composioKey) { showToast("Set your Composio API key first", "error"); return; }
    showToast("Connecting " + slug + "...", "info");

    async function safePost(url, body) {
        var bodyStr = JSON.stringify(body);
        var text = window.__TAURI__
            ? await tauriInvoke("run_shell_command", { commandName: "curl", args: ["-s", "-X", "POST", "-H", "x-api-key: " + composioKey, "-H", "Content-Type: application/json", "-d", bodyStr, url] })
            : await (await fetch(url, { method: "POST", headers: { "x-api-key": composioKey, "Content-Type": "application/json" }, body: bodyStr })).text();
        if (!text || text.trim().charAt(0) !== "{") throw new Error("Non-JSON response: " + text.substring(0, 120));
        return JSON.parse(text);
    }

    async function safeGet(url) {
        var text = window.__TAURI__
            ? await tauriInvoke("run_shell_command", { commandName: "curl", args: ["-s", "-H", "x-api-key: " + composioKey, url] })
            : await (await fetch(url, { headers: { "x-api-key": composioKey } })).text();
        if (!text || text.trim().charAt(0) !== "{") throw new Error("Non-JSON response: " + text.substring(0, 120));
        return JSON.parse(text);
    }

    try {
        var intData = await safeGet(COMPOSIO_API_URL + "/integrations?appName=" + encodeURIComponent(slug));
        var integrations = intData.items || (Array.isArray(intData) ? intData : []);
        if (!integrations.length) { showToast("No integration found for " + slug + ". Set it up at app.composio.dev first.", "error"); return; }
        var integrationId = integrations[0].id;
        var connData = await safePost(COMPOSIO_API_URL + "/connectedAccounts", { integrationId: integrationId, entityId: "default", data: { api_key: key, token: key, access_token: key } });
        if (connData.connectionStatus === "ACTIVE" || connData.id) {
            showToast(slug + " connected successfully!", "success");
            for (var i = 0; i < composioToolkits.length; i++) { if (composioToolkits[i].slug === slug) { composioToolkits[i].auth_warning = false; break; } }
            renderComposioToolkits(); renderEnabledIntegrations(); overlay.remove();
        } else if (connData.redirectUrl) {
            showToast("This service requires OAuth. Opening authorization page...", "info");
            window.__TAURI__ && window.__TAURI__.shell ? window.__TAURI__.shell.open(connData.redirectUrl) : window.open(connData.redirectUrl, "_blank");
            setTimeout(function() { checkComposioConnection(slug); }, 15000);
            overlay.remove();
        } else {
            showToast("Connection attempt returned unexpected response: " + JSON.stringify(connData).substring(0, 100), "error");
        }
    } catch(e) {
        showToast("Connection error: " + (e.message || e), "error");
        appendLog("dash-log", "[SKILLS] API key connect error for " + slug + ": " + (e.message || e));
    }
}

async function performComposioOAuth(slug) {
    var composioKey = currentConfig.composioApiKey;
    if (!composioKey) { showToast("Set your Composio API key first", "error"); return; }
    showToast("Connecting " + slug + "...", "info");

    async function composioPost(endpoint, body) {
        var url = COMPOSIO_API_URL + endpoint;
        var bodyStr = JSON.stringify(body);
        if (window.__TAURI__) {
            var raw = await tauriInvoke("run_shell_command", { commandName: "curl", args: ["-s", "-X", "POST", "-H", "x-api-key: " + composioKey, "-H", "Content-Type: application/json", "-d", bodyStr, url] });
            if (!raw || raw.trim().charAt(0) !== "{") throw new Error("Composio returned non-JSON: " + (raw || "").substring(0, 120));
            return JSON.parse(raw);
        } else {
            var resp = await fetch(url, { method: "POST", headers: { "x-api-key": composioKey, "Content-Type": "application/json" }, body: bodyStr });
            var text = await resp.text();
            if (!text || text.trim().charAt(0) !== "{") throw new Error("Composio returned non-JSON (HTTP " + resp.status + "): " + text.substring(0, 120));
            return JSON.parse(text);
        }
    }

    async function composioGet(endpoint) {
        var url = COMPOSIO_API_URL + endpoint;
        if (window.__TAURI__) {
            var raw = await tauriInvoke("run_shell_command", { commandName: "curl", args: ["-s", "-H", "x-api-key: " + composioKey, url] });
            if (!raw || raw.trim().charAt(0) !== "{") throw new Error("Composio returned non-JSON: " + (raw || "").substring(0, 120));
            return JSON.parse(raw);
        } else {
            var resp = await fetch(url, { headers: { "x-api-key": composioKey } });
            var text = await resp.text();
            if (!text || text.trim().charAt(0) !== "{") throw new Error("Composio returned non-JSON (HTTP " + resp.status + "): " + text.substring(0, 120));
            return JSON.parse(text);
        }
    }

    try {
        // Step 1: look up integrations for this app
        var intData = await composioGet("/integrations?appName=" + encodeURIComponent(slug) + "&limit=10");
        var integrations = intData.items || (Array.isArray(intData) ? intData : []);

        var connData;
        if (integrations.length > 0) {
            // Use first available integration
            connData = await composioPost("/connectedAccounts", { integrationId: integrations[0].id, entityId: "default" });
        } else {
            // No pre-built integration — try initiating directly by app name (Composio v2 style)
            connData = await composioPost("/connectedAccounts", { appName: slug, entityId: "default", authMode: "OAUTH2" });
        }

        if (connData.redirectUrl) {
            showToast("Opening authorization page for " + slug + "...", "success");
            if (window.__TAURI__ && window.__TAURI__.shell) {
                window.__TAURI__.shell.open(connData.redirectUrl);
            } else {
                window.open(connData.redirectUrl, "_blank");
            }
            // Poll for connection completion
            setTimeout(function() { checkComposioConnection(slug); }, 15000);
            setTimeout(function() { checkComposioConnection(slug); }, 30000);
            setTimeout(function() { checkComposioConnection(slug); }, 60000);
        } else if (connData.connectionStatus === "ACTIVE" || connData.status === "ACTIVE") {
            showToast(slug + " connected successfully!", "success");
            for (var i = 0; i < composioToolkits.length; i++) {
                if (composioToolkits[i].slug === slug) { composioToolkits[i].auth_warning = false; break; }
            }
            renderComposioToolkits();
            renderEnabledIntegrations();
        } else if (connData.error || connData.message) {
            var errMsg = connData.error || connData.message;
            showToast("Composio error: " + errMsg, "error");
            appendLog("dash-log", "[SKILLS] OAuth error for " + slug + ": " + errMsg);
            // Fall back to opening Composio dashboard for manual setup
            var fb = "https://app.composio.dev/apps/" + slug;
            setTimeout(function() {
                if (window.__TAURI__ && window.__TAURI__.shell) window.__TAURI__.shell.open(fb);
                else window.open(fb, "_blank");
            }, 2000);
        } else {
            // Unknown response — open Composio dashboard as fallback
            appendLog("dash-log", "[SKILLS] Unexpected OAuth response for " + slug + ": " + JSON.stringify(connData).substring(0, 200));
            showToast("Could not initiate OAuth automatically. Opening Composio dashboard...", "info");
            var fb2 = "https://app.composio.dev/apps/" + slug;
            if (window.__TAURI__ && window.__TAURI__.shell) window.__TAURI__.shell.open(fb2);
            else window.open(fb2, "_blank");
        }
    } catch(e) {
        appendLog("dash-log", "[SKILLS] OAuth exception for " + slug + ": " + (e.message || e));
        showToast("Connection error: " + (e.message || e), "error");
        // Always offer the Composio dashboard as a manual fallback
        var fb3 = "https://app.composio.dev/apps/" + slug;
        setTimeout(function() {
            if (window.__TAURI__ && window.__TAURI__.shell) window.__TAURI__.shell.open(fb3);
            else window.open(fb3, "_blank");
        }, 2500);
    }
}

var builtinSkills = [
    { id: "web_browser", icon: "🌐", name: "Web Browser", desc: "Navigate and scrape websites via Playwright" },
    { id: "web_search",  icon: "🔍", name: "Web Search",  desc: "Search Google, DuckDuckGo, or Bing" },
    { id: "docker",      icon: "🐳", name: "Docker",      desc: "Manage containers, images, and volumes" },
    { id: "ssh_remote",  icon: "🔑", name: "SSH Remote",  desc: "Execute commands on remote servers" },
    { id: "mqtt_bridge", icon: "📡", name: "MQTT Bridge", desc: "Publish/subscribe to MQTT topics" },
    { id: "serial_port", icon: "🔌", name: "Serial Port", desc: "Read/write to serial devices (Arduino, ESP32)" },
    { id: "b500_telemetry", icon: "🎋", name: "B500 Telemetry", desc: "Monitor BambooCore B500 facility sensors" }
];

function renderBuiltinSkills() {
    var el = document.getElementById("skills-builtin");
    if (!el) return;
    var html = "";
    builtinSkills.forEach(function(s) {
        html += '<div class="skill-card enabled" data-skill-id="' + s.id + '" data-skill-type="builtin">';
        html += '<span class="skill-always-on">Always On</span>';
        html += '<div class="skill-icon">' + s.icon + '</div>';
        html += '<div class="skill-name">' + escapeHtml(s.name) + '</div>';
        html += '<div class="skill-meta"><span style="font-size:0.65rem;color:var(--text-dim);">● Built-in</span><button class="skill-info-btn" title="Show details">i</button></div>';
        html += '<div class="skill-desc-full">' + escapeHtml(s.desc) + '</div>';
        html += '</div>';
    });
    el.innerHTML = html;
}

function renderComposioToolkits() {
    var el = document.getElementById("skills-composio");
    if (!el) return;
    var searchEl = document.getElementById("skill-search");
    var search = searchEl ? searchEl.value.toLowerCase() : "";
    var filtered = composioToolkits.filter(function(tk) {
        if (search && tk.name.toLowerCase().indexOf(search) < 0 && (tk.description || "").toLowerCase().indexOf(search) < 0 && tk.slug.toLowerCase().indexOf(search) < 0) return false;
        if (composioActiveCategory !== "All") { var cats = tk.categories || []; if (cats.indexOf(composioActiveCategory) < 0) return false; }
        return true;
    });
    var html = "";
    filtered.forEach(function(tk) {
        var isEnabled = enabledSkills["composio_" + tk.slug] || false;
        var imgSrc = "";
        if (tk.local_logo && window.__TAURI__) {
            var convertFn = (window.__TAURI__.core && window.__TAURI__.core.convertFileSrc) || (window.__TAURI__.tauri && window.__TAURI__.tauri.convertFileSrc) || window.__TAURI__.convertFileSrc;
            if (convertFn) try { imgSrc = convertFn(tk.local_logo); } catch(ce) {}
        }
        if (!imgSrc && tk.logo) imgSrc = tk.logo;
        html += '<div class="skill-card ' + (isEnabled ? 'enabled' : '') + '" data-skill-id="composio_' + tk.slug + '" data-skill-type="composio" data-toolkit-slug="' + tk.slug + '">';
        html += '<button class="skill-toggle" title="' + (isEnabled ? 'Disable' : 'Enable') + '"></button>';
        html += imgSrc ? '<div class="skill-icon"><img src="' + escapeHtml(imgSrc) + '" data-slug="' + escapeHtml(tk.slug) + '" onerror="this.outerHTML=\'<span class=skill-icon>🧩</span>\'" /></div>' : '<div class="skill-icon">🧩</div>';
        html += '<div class="skill-name">' + escapeHtml(tk.name) + '</div>';
        html += '<div class="skill-meta">';
        if (tk.tools_count > 0) html += '<span style="font-size:0.65rem;color:var(--accent);">● ' + tk.tools_count + ' tools</span>';
        if (tk.triggers_count > 0) html += '<span style="font-size:0.65rem;color:var(--warning);">⚡ ' + tk.triggers_count + ' triggers</span>';
        html += '<button class="skill-info-btn" title="Show details">i</button></div>';
        if (tk.auth_warning) html += '<div class="auth-warning-badge">⚠ Not connected — <span style="cursor:pointer;text-decoration:underline;" data-connect-slug="' + escapeHtml(tk.slug) + '">link account</span></div>';
        html += '<div class="skill-desc-full" data-toolkit-slug="' + tk.slug + '"><div>' + escapeHtml(tk.description || "No description available") + '</div>';
        html += '<div class="toolkit-tools-list" id="toolkit-tools-' + tk.slug + '"><div style="color:var(--text-dim);font-size:0.65rem;padding:0.3rem 0;">Click to load tools...</div></div>';
        html += '<div id="toolkit-triggers-' + tk.slug + '"></div></div>';
        html += '</div>';
    });
    el.innerHTML = html || '<div style="color:var(--text-dim);font-size:0.85rem;padding:0.5rem;">No matching toolkits</div>';
    el.querySelectorAll("span[data-connect-slug]").forEach(function(span) {
        span.addEventListener("click", function(e) { e.stopPropagation(); showConnectionModal(span.dataset.connectSlug); });
    });
}

function renderComposioCategories() {
    var el = document.getElementById("composio-category-tabs");
    if (!el) return;
    var html = "";
    composioCategories.forEach(function(cat) {
        html += '<button class="btn btn-sm ' + (cat === composioActiveCategory ? '' : 'btn-outline') + '" style="font-size:0.75rem;" data-composio-cat="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</button>';
    });
    el.innerHTML = html;
}

function renderAllSkills() { renderBuiltinSkills(); renderComposioToolkits(); renderComposioCategories(); renderEnabledIntegrations(); }

function renderEnabledIntegrations() {
    var section = document.getElementById("enabled-integrations-section");
    var grid = document.getElementById("skills-enabled-integrations");
    if (!section || !grid) return;
    var html = "", count = 0;
    Object.keys(enabledSkills).forEach(function(k) {
        if (!enabledSkills[k] || !k.startsWith("composio_")) return;
        count++;
        var slug = k.replace("composio_", "");
        var tk = composioToolkits.find(function(t) { return t.slug === slug; });
        var name = tk ? (tk.meta_name || tk.name || slug) : slug;
        var imgSrc = "";
        if (tk && tk.local_logo && window.__TAURI__) {
            var convertFn = (window.__TAURI__.core && window.__TAURI__.core.convertFileSrc) || (window.__TAURI__.tauri && window.__TAURI__.tauri.convertFileSrc) || window.__TAURI__.convertFileSrc;
            if (convertFn) try { imgSrc = convertFn(tk.local_logo); } catch(ce) {}
        }
        if (!imgSrc && tk && tk.logo) imgSrc = tk.logo;
        var toolCount = 0;
        agentTools.forEach(function(t) { if (t.function.name.indexOf(slug) > -1) toolCount++; });
        html += '<div class="skill-card" style="cursor:pointer;" data-toggle-skill="' + escapeHtml(k) + '">';
        html += '<div style="display:flex;align-items:center;gap:0.5rem;">';
        html += imgSrc ? '<div class="skill-icon"><img src="' + escapeHtml(imgSrc) + '" onerror="this.outerHTML=\'<span class=skill-icon>🧩</span>\'" /></div>' : '<div class="skill-icon">🧩</div>';
        html += '<div style="flex:1;"><div style="font-size:0.85rem;font-weight:600;">' + escapeHtml(name) + '</div>' + (toolCount > 0 ? '<span style="font-size:0.7rem;color:var(--text-dim);">' + toolCount + ' tools</span>' : '') + '</div>';
        html += '<span style="color:#ef4444;font-size:0.7rem;cursor:pointer;" title="Click to disable">✕</span>';
        html += '</div>';
        if (tk && tk.auth_warning) html += '<div class="auth-warning-badge">⚠ Not connected — <span style="cursor:pointer;text-decoration:underline;" data-connect-slug="' + escapeHtml(slug) + '">link account</span></div>';
        html += '</div>';
    });
    if (count > 0) {
        section.style.display = "";
        grid.innerHTML = html;
        grid.querySelectorAll("[data-toggle-skill]").forEach(function(el) {
            el.addEventListener("click", function() { toggleSkill(el.getAttribute("data-toggle-skill")); });
        });
        grid.querySelectorAll("span[data-connect-slug]").forEach(function(span) {
            span.addEventListener("click", function(e) { e.stopPropagation(); showConnectionModal(span.dataset.connectSlug); });
        });
    } else {
        section.style.display = "none";
        grid.innerHTML = "";
    }
}

function toggleSkill(skillId) {
    enabledSkills[skillId] = !enabledSkills[skillId];
    currentConfig.enabledSkills = enabledSkills;
    saveAllConfig();
    renderAllSkills();
    if (enabledSkills[skillId]) {
        if (skillId.startsWith("composio_")) { fetchToolkitTools(skillId.replace("composio_", "")); }
        else { rebuildBuiltinTools(); }
        showToast(skillId.replace("composio_","") + " enabled", "success");
    } else {
        agentTools = agentTools.filter(function(t) { return !t.function.name.startsWith("composio_"); });
        Object.keys(enabledSkills).forEach(function(sk) {
            if (!enabledSkills[sk] || !sk.startsWith("composio_")) return;
            var skSlug = sk.replace("composio_","");
            var cached = composioToolkitDetails[skSlug];
            if (cached) cached.forEach(function(tool) { _addComposioTool(tool, skSlug); });
        });
        rebuildBuiltinTools();
        showToast(skillId.replace("composio_","") + " disabled", "info");
    }
    renderActiveToolsSummary();
    renderEnabledIntegrations();
}
window.toggleSkill = toggleSkill;

function _addComposioTool(tool, skSlug) {
    var rawP = tool.input_parameters || tool.parameters || { type: "object", properties: {}, required: [] };
    var params = sanitizeToolSchema(rawP);
    var realSlug = tool.slug || tool.name || "";
    var safeName = ("composio_" + realSlug.replace(/[^a-zA-Z0-9_-]/g, "_")).substring(0, 64);
    window.composioToolMap = window.composioToolMap || {};
    window.composioToolMap[safeName] = realSlug;
    agentTools.push({ type: "function", function: { name: safeName, description: (tool.description || tool.name || skSlug + " tool").substring(0, 1024), parameters: params } });
}

async function fetchToolkitTools(slug) {
    var composioKey = currentConfig.composioApiKey;
    if (!composioKey) return;
    try {
        var endpoint = COMPOSIO_API_URL + "/tools?toolkit=" + encodeURIComponent(slug) + "&limit=200";
        var toolsJson = window.__TAURI__ ? await tauriInvoke("run_shell_command", { commandName: "curl", args: ["-s", "-H", "x-api-key: " + composioKey, endpoint] }) : await (await fetch(endpoint, { headers: { "x-api-key": composioKey } })).text();
        var data = JSON.parse(toolsJson);
        var tools = data.items || [];
        composioToolkitDetails[slug] = tools;
        agentTools = agentTools.filter(function(t) { return !t.function.name.startsWith("composio_"); });
        Object.keys(enabledSkills).forEach(function(skillId) {
            if (!enabledSkills[skillId] || !skillId.startsWith("composio_")) return;
            var sk = skillId.replace("composio_", "");
            var cached = composioToolkitDetails[sk];
            if (cached) cached.forEach(function(tool) { _addComposioTool(tool, sk); });
        });
        showToast(slug + ": " + tools.length + " tools added to agent", "success");
        renderActiveToolsSummary(); renderEnabledIntegrations();
        checkComposioConnection(slug); fetchToolkitTriggers(slug); renderToolkitToolsList(slug);
    } catch(e) {
        agentTools.push({ type: "function", function: { name: "composio_" + slug, description: "Use " + slug + " via Composio.", parameters: { type: "object", properties: { action: { type: "string" } }, required: ["action"], additionalProperties: false } } });
    }
}

async function fetchToolkitTriggers(slug) {
    var composioKey = currentConfig.composioApiKey;
    if (!composioKey) return;
    try {
        var endpoint = COMPOSIO_API_URL + "/triggers?toolkit=" + encodeURIComponent(slug) + "&limit=50";
        var resultJson = window.__TAURI__ ? await tauriInvoke("run_shell_command", { commandName: "curl", args: ["-s", "-H", "x-api-key: " + composioKey, endpoint] }) : await (await fetch(endpoint, { headers: { "x-api-key": composioKey } })).text();
        composioToolkitDetails[slug + "_triggers"] = JSON.parse(resultJson).items || [];
        renderToolkitTriggers(slug);
    } catch(e) {}
}

function renderToolkitTriggers(slug) {
    var el = document.getElementById("toolkit-triggers-" + slug);
    if (!el) return;
    var triggers = composioToolkitDetails[slug + "_triggers"];
    if (!triggers || triggers.length === 0) { el.innerHTML = ""; return; }
    var html = '<div style="font-size:0.7rem;font-weight:600;color:var(--warning);margin-top:0.75rem;margin-bottom:0.3rem;">⚡ Triggers (' + triggers.length + '):</div>';
    triggers.forEach(function(tr) {
        html += '<div class="trigger-entry"><div class="trigger-name">' + escapeHtml(tr.name || tr.slug || "Unknown") + '</div>';
        if (tr.description) html += '<div class="trigger-desc">' + escapeHtml(tr.description.substring(0, 150)) + (tr.description.length > 150 ? "…" : "") + '</div>';
        html += '</div>';
    });
    html += '<div class="trigger-info-banner">⚡ Triggers require a local webhook endpoint. This feature is coming in a future update.</div>';
    el.innerHTML = html;
}

function renderToolkitToolsList(slug) {
    var el = document.getElementById("toolkit-tools-" + slug);
    if (!el) return;
    var tools = composioToolkitDetails[slug];
    if (!tools || tools.length === 0) { el.innerHTML = '<div style="color:var(--text-dim);font-size:0.65rem;padding:0.3rem 0;">No tools found.</div>'; return; }
    var html = '<div style="font-size:0.7rem;font-weight:600;color:var(--text);margin-bottom:0.3rem;">Tools (' + tools.length + '):</div>';
    tools.forEach(function(tool, idx) {
        var toolSlug = tool.slug || "", toolName = tool.name || toolSlug, toolDesc = tool.description || "";
        var params = tool.input_parameters || tool.parameters || {}, props = params.properties || {}, reqList = params.required || [];
        var outProps = (tool.output_parameters || {}).properties || {};
        html += '<div class="toolkit-tool-row" data-tool-idx="' + idx + '" data-toolkit-slug="' + slug + '">';
        html += '<div class="tool-header"><span class="tool-name">▸ ' + escapeHtml(toolName) + '</span></div>';
        html += '<div class="tool-slug">' + escapeHtml(toolSlug) + '</div>';
        if (toolDesc) html += '<div class="tool-desc">' + escapeHtml(toolDesc.substring(0, 120)) + (toolDesc.length > 120 ? "…" : "") + '</div>';
        html += '<div class="toolkit-tool-params" id="tool-params-' + slug + '-' + idx + '">';
        var propKeys = Object.keys(props);
        if (propKeys.length > 0) {
            html += '<div style="color:var(--accent);margin-bottom:0.2rem;">Input Parameters:</div>';
            propKeys.forEach(function(pName) {
                var p = props[pName], isReq = reqList.indexOf(pName) >= 0;
                html += '<div class="param-row"><span class="param-name">' + escapeHtml(pName) + '</span><span class="param-type">' + escapeHtml(p.type || "any") + '</span>' + (isReq ? '<span class="param-req">required</span>' : '') + '</div>';
                if (p.description) html += '<div style="color:var(--text-dim);font-size:0.55rem;padding-left:0.5rem;margin-bottom:0.15rem;">' + escapeHtml(p.description.substring(0, 100)) + '</div>';
            });
        }
        var outKeys = Object.keys(outProps);
        if (outKeys.length > 0) {
            html += '<div style="color:var(--warning);margin-top:0.3rem;margin-bottom:0.2rem;">Output Parameters:</div>';
            outKeys.forEach(function(pName) { html += '<div class="param-row"><span class="param-name">' + escapeHtml(pName) + '</span><span class="param-type">' + escapeHtml(outProps[pName].type || "any") + '</span></div>'; });
        }
        if (propKeys.length === 0 && outKeys.length === 0) html += '<div style="color:var(--text-dim);">No parameters defined</div>';
        html += '</div></div>';
    });
    el.innerHTML = html;
}

async function loadToolkitToolsOnDemand(slug) {
    if (composioToolkitDetails[slug]) { renderToolkitToolsList(slug); return; }
    var el = document.getElementById("toolkit-tools-" + slug);
    if (el) el.innerHTML = '<div style="color:var(--text-dim);font-size:0.65rem;padding:0.3rem 0;">Loading tools...</div>';
    var composioKey = currentConfig.composioApiKey;
    if (!composioKey) return;
    try {
        var endpoint = COMPOSIO_API_URL + "/tools?toolkit=" + encodeURIComponent(slug) + "&limit=200";
        var toolsJson = window.__TAURI__ ? await tauriInvoke("run_shell_command", { commandName: "curl", args: ["-s", "-H", "x-api-key: " + composioKey, endpoint] }) : await (await fetch(endpoint, { headers: { "x-api-key": composioKey } })).text();
        composioToolkitDetails[slug] = JSON.parse(toolsJson).items || [];
        renderToolkitToolsList(slug);
        if (!composioToolkitDetails[slug + "_triggers"]) fetchToolkitTriggers(slug);
        else renderToolkitTriggers(slug);
    } catch(e) {
        if (el) el.innerHTML = '<div style="color:var(--error);font-size:0.65rem;">Failed to load tools</div>';
    }
}

function rebuildBuiltinTools() {
    agentTools = agentTools.filter(function(t) { return !["web_browse","web_search","docker_command","ssh_execute","mqtt_publish"].includes(t.function.name); });
    builtinSkills.forEach(function(s) {
        if (!enabledSkills[s.id]) return;
        if (s.id === "web_browser") agentTools.push({ type: "function", function: { name: "web_browse", description: "Open URL in headless browser", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } } });
        else if (s.id === "web_search") agentTools.push({ type: "function", function: { name: "web_search", description: "Search the web", parameters: { type: "object", properties: { query: { type: "string" }, engine: { type: "string" } }, required: ["query"], additionalProperties: false } } });
        else if (s.id === "docker") agentTools.push({ type: "function", function: { name: "docker_command", description: "Docker commands", parameters: { type: "object", properties: { args: { type: "array", items: { type: "string" } } }, required: ["args"], additionalProperties: false } } });
        else if (s.id === "ssh_remote") agentTools.push({ type: "function", function: { name: "ssh_execute", description: "SSH commands", parameters: { type: "object", properties: { host: { type: "string" }, user: { type: "string" }, command: { type: "string" }, port: { type: "number" } }, required: ["host","user","command"], additionalProperties: false } } });
        else if (s.id === "mqtt_bridge") agentTools.push({ type: "function", function: { name: "mqtt_publish", description: "MQTT publish", parameters: { type: "object", properties: { broker: { type: "string" }, topic: { type: "string" }, message: { type: "string" } }, required: ["broker","topic","message"], additionalProperties: false } } });
    });
    renderActiveToolsSummary(); renderEnabledIntegrations();
}

async function saveComposioKey() {
    var key = document.getElementById("composio-api-key").value.trim();
    if (!key) { showToast("Please enter a Composio API key", "error"); return; }
    currentConfig.composioApiKey = key;
    saveAllConfig();
    var statusEl = document.getElementById("composio-status");
    statusEl.style.display = "block";
    statusEl.innerHTML = '<span style="color:var(--text-dim);">⟳ Validating key and fetching toolkits...</span>';

    var validated = false, toolkitsData = null;

    if (window.__TAURI__) {
        try {
            var curlResult = await tauriInvoke("run_shell_command", { commandName: "curl", args: ["-s", "-H", "x-api-key: " + key, COMPOSIO_API_URL + "/toolkits?limit=500"] });
            try {
                toolkitsData = JSON.parse(curlResult);
                if (toolkitsData.items) validated = true;
                else if (toolkitsData.error || toolkitsData.status === 401) { statusEl.innerHTML = '<span style="color:var(--error);">✗ Invalid API key</span>'; return; }
            } catch(pe) { if ((curlResult||"").indexOf("401") >= 0) { statusEl.innerHTML = '<span style="color:var(--error);">✗ Invalid API key</span>'; return; } }
        } catch(e) {}
    }

    if (!validated) {
        try {
            var resp = await fetch(COMPOSIO_API_URL + "/toolkits?limit=500", { headers: { "x-api-key": key } });
            if (resp.ok) { toolkitsData = await resp.json(); if (toolkitsData.items) validated = true; }
            else if (resp.status === 401 || resp.status === 403) { statusEl.innerHTML = '<span style="color:var(--error);">✗ Invalid API key</span>'; return; }
        } catch(e) {}
    }

    if (!validated || !toolkitsData) { statusEl.innerHTML = '<span style="color:var(--warning);">⚠ Cannot validate from browser (CORS). Key saved for desktop use.</span>'; return; }

    composioToolkits = (toolkitsData.items || []).map(function(tk) {
        var m = tk.meta || {};
        return { slug: tk.slug, name: tk.name || tk.slug, description: m.description || tk.description || "", logo: m.logo || tk.logo || "", categories: (m.categories || tk.categories || []).map(function(c) { return (typeof c === "object" && c.name) ? c.name : String(c); }), tools_count: m.tools_count || tk.tools_count || 0, triggers_count: m.triggers_count || tk.triggers_count || 0 };
    });

    statusEl.innerHTML = '<span style="color:var(--accent);">✓ Connected to Composio</span>';
    var catSet = {};
    composioToolkits.forEach(function(tk) { (tk.categories || []).forEach(function(c) { catSet[c] = true; }); });
    composioCategories = ["All"].concat(Object.keys(catSet).sort());
    document.getElementById("composio-placeholder").classList.add("hidden");
    document.getElementById("composio-connected-area").classList.remove("hidden");
    renderAllSkills();
    cacheToolkitLogos();
}

async function ensureLogosDir() {
    if (logosDir) return logosDir;
    if (!window.__TAURI__) return "";
    try {
        var home = await tauriInvoke("get_home_dir", {});
        if (!home) return "";
        var sep = detectedOS === "windows" ? "\\" : "/";
        logosDir = home.replace(/[\/\\]+$/, "") + sep + "bambooclaw" + sep + "logos";
        await tauriInvoke("run_shell_command", { commandName: detectedOS === "windows" ? "cmd" : "sh", args: detectedOS === "windows" ? ["/c","mkdir",logosDir,"2>nul"] : ["-c","mkdir -p \"" + logosDir + "\""] }).catch(function(){});
        return logosDir;
    } catch(e) { return ""; }
}

async function cacheToolkitLogos() {
    var dir = await ensureLogosDir();
    if (!dir) return;
    var sep = detectedOS === "windows" ? "\\" : "/";
    var toDownload = [];
    for (var i = 0; i < composioToolkits.length; i++) {
        var tk = composioToolkits[i];
        if (!tk.logo) continue;
        var ext = tk.logo.indexOf(".svg") > -1 ? ".svg" : ".png";
        var localPath = dir + sep + tk.slug + ext;
        toDownload.push({ idx: i, slug: tk.slug, url: tk.logo, path: localPath });
    }
    var batchSize = 15;
    for (var b = 0; b < toDownload.length; b += batchSize) {
        var batch = toDownload.slice(b, b + batchSize);
        await Promise.allSettled(batch.map(function(item) {
            return invokeShort("run_shell_command", { commandName: detectedOS === "windows" ? "cmd" : "sh", args: detectedOS === "windows" ? ["/c","if","exist",item.path,"(echo","EXISTS)","else","(echo","MISSING)"] : ["-c","test -f \"" + item.path + "\" && echo EXISTS || echo MISSING"] }).then(function(result) {
                if (result && result.indexOf("EXISTS") > -1) { composioToolkits[item.idx].local_logo = item.path; return; }
                return invokeShort("run_shell_command", { commandName: "curl", args: ["-sL", "-o", item.path, item.url] }).then(function() { composioToolkits[item.idx].local_logo = item.path; }).catch(function(){});
            }).catch(function(){});
        }));
    }
    renderComposioToolkits();
}