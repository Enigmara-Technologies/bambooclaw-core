// =========== SKILLS / COMPOSIO ===========
var COMPOSIO_API_URL = "https://backend.composio.dev/api/v3";
var enabledSkills = {};
var composioToolkits = [];
var composioCategories = ["All"];
var composioActiveCategory = "All";
var composioToolkitDetails = {};

var builtinSkills = [
    { id: "web_browser", icon: "🌐", name: "Web Browser", desc: "Navigate and scrape websites via Playwright" },
    { id: "web_search", icon: "🔍", name: "Web Search", desc: "Search Google, DuckDuckGo, or Bing" },
    { id: "docker", icon: "🐳", name: "Docker", desc: "Manage containers, images, and volumes" },
    { id: "ssh_remote", icon: "🔑", name: "SSH Remote", desc: "Execute commands on remote servers" },
    { id: "mqtt_bridge", icon: "📡", name: "MQTT Bridge", desc: "Publish/subscribe to MQTT topics" },
    { id: "serial_port", icon: "🔌", name: "Serial Port", desc: "Read/write to serial devices" },
    { id: "b500_telemetry", icon: "🎋", name: "B500 Telemetry", desc: "Monitor BambooCore B500 facility sensors" }
];

function sanitizeToolSchema(rawParams) {
    if (!rawParams || typeof rawParams !== "object") return { type: "object", properties: {}, required: [], additionalProperties: false };
    var p; try { p = JSON.parse(JSON.stringify(rawParams)); } catch(e) { return { type: "object", properties: {}, required: [], additionalProperties: false }; }

    function cleanProp(obj) {
        if (!obj || typeof obj !== "object") return obj;
        if (Array.isArray(obj)) return obj.map(cleanProp);
        ["$ref", "$defs", "$schema", "$id", "default", "examples", "example", "title", "format", "readOnly", "writeOnly"].forEach(function(k) { delete obj[k]; });
        if (obj.properties) { Object.keys(obj.properties).forEach(function(k) { obj.properties[k] = cleanProp(obj.properties[k]); }); }
        if (obj.items) obj.items = cleanProp(obj.items);
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
    var enabledCount = 0;
    var html = "";
    Object.keys(enabledSkills).forEach(function(k) {
        if (enabledSkills[k]) {
            enabledCount++;
            var isComposio = k.startsWith("composio_");
            var label = isComposio ? k.replace("composio_", "") : k;
            html += '<div class="active-tool-entry"><span class="tool-dot ' + (isComposio ? "composio" : "builtin") + '"></span>' + escapeHtml(label) + '</div>';
        }
    });
    badge.textContent = enabledCount;
    listEl.innerHTML = html || '<div style="color:var(--text-dim);font-size:0.75rem;padding:0.25rem 0;">No tools loaded</div>';
}

async function checkComposioConnection(slug) {
    var composioKey = currentConfig.composioApiKey;
    if (!composioKey) return;
    try {
        var resp = await fetch(COMPOSIO_API_URL + "/connected_accounts?toolkit=" + encodeURIComponent(slug), { headers: { "x-api-key": composioKey } });
        var data = await resp.json();
        var hasConnection = (data.items || data.results || data || []).length > 0;
        for (var i = 0; i < composioToolkits.length; i++) {
            if (composioToolkits[i].slug === slug) { composioToolkits[i].auth_warning = !hasConnection; break; }
        }
        renderComposioToolkits();
    } catch(e) {}
}

function showConnectionModal(slug) {
    var existing = document.getElementById("conn-modal-overlay");
    if (existing) existing.remove();
    var tk = composioToolkits.find(t => t.slug === slug);
    var name = tk ? (tk.meta_name || tk.name || slug) : slug;

    var overlay = document.createElement("div");
    overlay.id = "conn-modal-overlay";
    overlay.className = "conn-modal-overlay visible";
    overlay.innerHTML = '<div class="conn-modal">' +
        '<h3>Connect ' + escapeHtml(name) + '</h3>' +
        '<p>Link your account so the agent can use its tools.</p>' +
        '<div style="display: flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; background: #050507; overflow: hidden; margin-bottom: 0.75rem;"><input type="password" id="conn-api-key" placeholder="Paste your API key here" style="border: none; border-radius: 0; outline: none; background: transparent; flex: 1; padding: 0.75rem;" /><button type="button" class="btn btn-outline toggle-password-btn" data-target="conn-api-key" style="border: none; border-radius: 0; padding: 0.75rem; height: 100%; border-left: 1px solid var(--border);">👁️</button></div>' +
        '<button class="btn-connect" id="conn-btn-save-key">Connect with API Key</button>' +
        '<div class="conn-or">— or —</div>' +
        '<button class="btn-oauth" id="conn-btn-oauth">🔗 Connect via OAuth</button>' +
        '<button class="btn-cancel" id="conn-btn-cancel" style="margin-top:1rem;">Cancel</button></div>';
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
    document.getElementById("conn-btn-cancel").addEventListener("click", function() { overlay.remove(); });

    document.getElementById("conn-btn-save-key").addEventListener("click", async function() {
        var key = document.getElementById("conn-api-key").value.trim();
        var cKey = currentConfig.composioApiKey;
        if (!key || !cKey) return;
        try {
            var intResp = await fetch(COMPOSIO_API_URL + "/integrations?appName=" + encodeURIComponent(slug), { headers: { "x-api-key": cKey } });
            var intData = await intResp.json();
            var integrationId = (intData.items || intData)[0].id;
            var connBody = JSON.stringify({ integrationId: integrationId, entityId: "default", data: { api_key: key, token: key, access_token: key } });
            var connResp = await fetch(COMPOSIO_API_URL + "/connectedAccounts", { method: "POST", headers: { "x-api-key": cKey, "Content-Type": "application/json" }, body: connBody });
            var connData = await connResp.json();
            if (connData.connectionStatus === "ACTIVE" || connData.id) {
                showToast(slug + " connected!", "success");
                overlay.remove(); checkComposioConnection(slug); renderEnabledIntegrations();
            } else if (connData.redirectUrl) {
                window.open(connData.redirectUrl, "_blank"); overlay.remove();
            }
        } catch(e) { showToast("Error: " + e.message, "error"); }
    });

    document.getElementById("conn-btn-oauth").addEventListener("click", function() {
        overlay.remove(); performComposioOAuth(slug);
    });
}

async function performComposioOAuth(slug) {
    var cKey = currentConfig.composioApiKey;
    if (!cKey) return;
    try {
        var intResp = await fetch(COMPOSIO_API_URL + "/integrations?appName=" + encodeURIComponent(slug), { headers: { "x-api-key": cKey } });
        var intData = await intResp.json();
        var connBody = JSON.stringify({ integrationId: (intData.items || intData)[0].id, entityId: "default" });
        var connResp = await fetch(COMPOSIO_API_URL + "/connectedAccounts", { method: "POST", headers: { "x-api-key": cKey, "Content-Type": "application/json" }, body: connBody });
        var connData = await connResp.json();
        if (connData.redirectUrl) {
            window.open(connData.redirectUrl, "_blank");
            setTimeout(function() { checkComposioConnection(slug); }, 15000);
        }
    } catch(e) { showToast("OAuth Error: " + e.message, "error"); }
}

function renderBuiltinSkills() {
    var el = document.getElementById("skills-builtin");
    if (!el) return;
    var html = "";
    builtinSkills.forEach(function(s) {
        html += '<div class="skill-card enabled" data-skill-id="' + s.id + '" data-skill-type="builtin">';
        html += '<span class="skill-always-on">Always On</span>';
        html += '<div class="skill-icon">' + s.icon + '</div><div class="skill-name">' + escapeHtml(s.name) + '</div>';
        html += '<div class="skill-desc-full">' + escapeHtml(s.desc) + '</div></div>';
    });
    el.innerHTML = html;
}

function renderComposioToolkits() {
    var el = document.getElementById("skills-composio");
    if (!el) return;
    var search = (document.getElementById("skill-search") ? document.getElementById("skill-search").value : "").toLowerCase();
    var html = "";
    var filtered = composioToolkits.filter(function(tk) {
        if (search && tk.name.toLowerCase().indexOf(search) < 0 && tk.slug.toLowerCase().indexOf(search) < 0) return false;
        if (composioActiveCategory !== "All" && (tk.categories || []).indexOf(composioActiveCategory) < 0) return false;
        return true;
    });
    filtered.forEach(function(tk) {
        var isEnabled = enabledSkills["composio_" + tk.slug] || false;
        html += '<div class="skill-card ' + (isEnabled ? 'enabled' : '') + '" data-skill-id="composio_' + tk.slug + '">';
        html += '<button class="skill-toggle"></button><div class="skill-icon">🧩</div>';
        html += '<div class="skill-name">' + escapeHtml(tk.name) + '</div>';
        if (tk.auth_warning) html += '<div class="auth-warning-badge">⚠ <span data-connect-slug="' + escapeHtml(tk.slug) + '">Link account</span></div>';
        html += '<div class="skill-desc-full">' + escapeHtml(tk.description || "") + '</div></div>';
    });
    el.innerHTML = html || '<div style="color:var(--text-dim);">No toolkits found</div>';
    el.querySelectorAll("span[data-connect-slug]").forEach(function(span) {
        span.addEventListener("click", function(e) { e.stopPropagation(); showConnectionModal(span.dataset.connectSlug); });
    });
}

function renderComposioCategories() {
    var el = document.getElementById("composio-category-tabs");
    if (!el) return;
    var html = "";
    composioCategories.forEach(function(cat) {
        var active = cat === composioActiveCategory;
        html += '<button class="btn btn-sm ' + (active ? '' : 'btn-outline') + '" data-composio-cat="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</button>';
    });
    el.innerHTML = html;
}

function renderAllSkills() { renderBuiltinSkills(); renderComposioToolkits(); renderComposioCategories(); renderEnabledIntegrations(); }

function renderEnabledIntegrations() {
    var section = document.getElementById("enabled-integrations-section");
    var grid = document.getElementById("skills-enabled-integrations");
    if (!section || !grid) return;
    var html = "";
    var count = 0;
    Object.keys(enabledSkills).forEach(function(k) {
        if (!enabledSkills[k] || !k.startsWith("composio_")) return;
        count++;
        var slug = k.replace("composio_", "");
        html += '<div class="skill-card" onclick="window.toggleSkill(\'' + k + '\')">';
        html += '<div style="display:flex;align-items:center;gap:0.5rem;"><div class="skill-icon">🧩</div>';
        html += '<div style="flex:1;"><div style="font-size:0.85rem;font-weight:600;">' + escapeHtml(slug) + '</div></div>';
        html += '<span style="color:#ef4444;font-size:0.7rem;">✕</span></div></div>';
    });
    if (count > 0) { section.style.display = ""; grid.innerHTML = html; }
    else { section.style.display = "none"; grid.innerHTML = ""; }
}

function toggleSkill(skillId) {
    enabledSkills[skillId] = !enabledSkills[skillId];
    currentConfig.enabledSkills = enabledSkills;
    saveAllConfig();
    renderAllSkills();
    renderActiveToolsSummary();
}
window.toggleSkill = toggleSkill;

function rebuildBuiltinTools() { /* Reduced in refactoring for UI speed, handled natively by daemon */ }

async function saveComposioKey() {
    var key = document.getElementById("composio-api-key").value.trim();
    if (!key) { showToast("Please enter a Composio API key", "error"); return; }
    currentConfig.composioApiKey = key; saveAllConfig();
    var statusEl = document.getElementById("composio-status");
    statusEl.style.display = "block"; statusEl.innerHTML = '<span style="color:var(--text-dim);">⟳ Validating...</span>';
    
    try {
        var resp = await fetch(COMPOSIO_API_URL + "/toolkits?limit=500", { headers: { "x-api-key": key } });
        if (resp.ok) {
            var data = await resp.json();
            composioToolkits = (data.items || []).map(function(tk) {
                return { slug: tk.slug, name: tk.name, description: tk.description, categories: tk.meta?.categories || [] };
            });
            statusEl.innerHTML = '<span style="color:var(--accent);">✓ Connected</span>';
            var catSet = {}; composioToolkits.forEach(function(tk) { (tk.categories || []).forEach(function(c) { catSet[c.name || c] = true; }); });
            composioCategories = ["All"].concat(Object.keys(catSet).sort());
            document.getElementById("composio-placeholder").classList.add("hidden");
            document.getElementById("composio-connected-area").classList.remove("hidden");
            renderAllSkills();
        } else {
            statusEl.innerHTML = '<span style="color:var(--error);">✗ Invalid API key</span>';
        }
    } catch(e) { statusEl.innerHTML = '<span style="color:var(--warning);">⚠ CORS error. Works in desktop mode.</span>'; }
}

document.getElementById("skills-composio").addEventListener("click", function(e) {
    var card = e.target.closest(".skill-card");
    if (card && !e.target.closest("span[data-connect-slug]")) toggleSkill(card.getAttribute("data-skill-id"));
});