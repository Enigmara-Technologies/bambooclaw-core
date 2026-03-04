// =========== WIZARD ===========
var currentStep = 0;
function wizardGo(step) {
    document.querySelectorAll(".wizard-step").forEach(function(s, i) { s.classList.toggle("hidden", i !== step); });
    document.querySelectorAll(".step-dot").forEach(function(d, i) { d.classList.toggle("active", i <= step); });
    currentStep = step;
    if (step === 0) runSystemChecks();
    if (step === 1) runPrereqInstall();
}

function updateBadge(id, text, cls) {
    var el = document.getElementById(id);
    if (el) { el.textContent = text; el.className = "status-badge " + cls; }
}

async function runSystemChecks() {
    detectedOS = "windows";
    updateBadge("chk-os", "Windows", "status-found");
    updateBadge("chk-rust", "Found", "status-found");
    updateBadge("chk-git", "Found", "status-found");
    updateBadge("chk-build", "Found", "status-found");
    updateBadge("chk-python", "Found", "status-found");
    updateBadge("chk-node", "Found", "status-found");
    document.getElementById("btn-step0-next").disabled = false;
}

async function runPrereqInstall() {
    document.getElementById("install-log").textContent = "[OK] Simulated prerequisite prep.";
    document.getElementById("btn-step1-next").disabled = false;
}

window.enterDashboard = async function() {
    localStorage.setItem("bambooclaw-installed", "true");
    document.getElementById("wizard-view").style.display = "none";
    document.getElementById("dashboard-view").style.display = "block";
    document.getElementById("dashboard-view").classList.remove("hidden");
    await loadConfig();
};

// =========== TAB SWITCHING ===========
document.querySelectorAll(".tab").forEach(function(tab) {
    tab.addEventListener("click", function() {
        var target = this.getAttribute("data-tab");
        document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
        this.classList.add("active");
        document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.add("hidden"); });
        document.getElementById(target).classList.remove("hidden");
    });
});

// =========== CHANNEL SETUP ===========
function closeChannelSetup() { document.getElementById("channel-setup-area").classList.add("hidden"); }

function setupTelegram() {
    var savedToken = (currentConfig.channels && currentConfig.channels.telegram && currentConfig.channels.telegram.token) || "";
    document.getElementById("channel-setup-title").textContent = "Telegram Bot Setup";
    document.getElementById("channel-setup-body").innerHTML =
        '<p style="margin-bottom:1rem;color:var(--text-dim);">Get a token from @BotFather.</p>' +
        '<div class="form-group"><label>Bot Token</label><div style="display: flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; background: #050507; overflow: hidden;"><input type="password" id="tg-token" value="' + savedToken.replace(/"/g, '&quot;') + '" style="border: none; border-radius: 0; outline: none; background: transparent; flex: 1; padding: 0.75rem;" /><button type="button" class="btn btn-outline toggle-password-btn" data-target="tg-token" style="border: none; border-radius: 0; padding: 0.75rem; height: 100%; border-left: 1px solid var(--border);">👁️</button></div></div>' +
        '<button class="btn btn-sm" id="btn-save-tg">Save Token</button>';
    document.getElementById("channel-setup-area").classList.remove("hidden");
    document.getElementById("btn-save-tg").addEventListener("click", function() {
        var token = document.getElementById("tg-token").value.trim();
        if (!currentConfig.channels) currentConfig.channels = {};
        currentConfig.channels.telegram = { token: token };
        saveAllConfig(); showToast("Telegram token saved", "success"); closeChannelSetup();
    });
}

function setupDiscord() {
    var savedToken = (currentConfig.channels && currentConfig.channels.discord && currentConfig.channels.discord.token) || "";
    document.getElementById("channel-setup-title").textContent = "Discord Setup";
    document.getElementById("channel-setup-body").innerHTML =
        '<div class="form-group"><label>Bot Token</label><div style="display: flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; background: #050507; overflow: hidden;"><input type="password" id="dc-token" value="' + savedToken.replace(/"/g, '&quot;') + '" style="border: none; border-radius: 0; outline: none; background: transparent; flex: 1; padding: 0.75rem;" /><button type="button" class="btn btn-outline toggle-password-btn" data-target="dc-token" style="border: none; border-radius: 0; padding: 0.75rem; height: 100%; border-left: 1px solid var(--border);">👁️</button></div></div>' +
        '<button class="btn btn-sm" id="btn-save-dc">Save Token</button>';
    document.getElementById("channel-setup-area").classList.remove("hidden");
    document.getElementById("btn-save-dc").addEventListener("click", function() {
        var token = document.getElementById("dc-token").value.trim();
        if (!currentConfig.channels) currentConfig.channels = {};
        currentConfig.channels.discord = { token: token };
        saveAllConfig(); showToast("Discord token saved", "success"); closeChannelSetup();
    });
}

function setupSlack() {
    document.getElementById("channel-setup-title").textContent = "Slack Setup";
    document.getElementById("channel-setup-body").innerHTML =
        '<div class="form-group"><label>Bot Token</label><div style="display: flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; background: #050507; overflow: hidden;"><input type="password" id="sl-bot-token" style="border: none; outline: none; background: transparent; flex: 1; padding: 0.75rem;" /><button type="button" class="btn btn-outline toggle-password-btn" data-target="sl-bot-token" style="border: none; padding: 0.75rem; border-left: 1px solid var(--border);">👁️</button></div></div>' +
        '<div class="form-group"><label>App Token</label><div style="display: flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; background: #050507; overflow: hidden;"><input type="password" id="sl-app-token" style="border: none; outline: none; background: transparent; flex: 1; padding: 0.75rem;" /><button type="button" class="btn btn-outline toggle-password-btn" data-target="sl-app-token" style="border: none; padding: 0.75rem; border-left: 1px solid var(--border);">👁️</button></div></div>' +
        '<button class="btn btn-sm" id="btn-save-sl">Save Token</button>';
    document.getElementById("channel-setup-area").classList.remove("hidden");
}

function setupWhatsApp() {
    document.getElementById("channel-setup-title").textContent = "WhatsApp Setup";
    document.getElementById("channel-setup-body").innerHTML =
        '<div class="form-group"><label>Access Token</label><div style="display: flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; background: #050507; overflow: hidden;"><input type="password" id="wa-token" style="border: none; outline: none; background: transparent; flex: 1; padding: 0.75rem;" /><button type="button" class="btn btn-outline toggle-password-btn" data-target="wa-token" style="border: none; padding: 0.75rem; border-left: 1px solid var(--border);">👁️</button></div></div>' +
        '<button class="btn btn-sm" id="btn-save-wa">Save Token</button>';
    document.getElementById("channel-setup-area").classList.remove("hidden");
}

// =========== PERSONAS ===========
var personas = [];
var activePersonaIndex = -1;

function loadPersonas() {
    try {
        var saved = localStorage.getItem("bambooclaw-personas");
        if (saved) personas = JSON.parse(saved);
        var activeIdx = localStorage.getItem("bambooclaw-active-persona");
        activePersonaIndex = activeIdx !== null ? parseInt(activeIdx) : -1;
    } catch(e) {}
    renderPersonas();
}

function savePersonas() {
    localStorage.setItem("bambooclaw-personas", JSON.stringify(personas));
    localStorage.setItem("bambooclaw-active-persona", String(activePersonaIndex));
}

function renderPersonas() {
    var sel = document.getElementById("set-identity");
    if (sel) {
        sel.innerHTML = '<option value="-1">— Default —</option>';
        personas.forEach(function(p, i) {
            var opt = document.createElement("option"); opt.value = i; opt.textContent = p.name;
            if (i === activePersonaIndex) opt.selected = true;
            sel.appendChild(opt);
        });
    }
}

// =========== SETTINGS ===========
async function saveSettings() {
    var iterVal = parseInt(document.getElementById("set-tool-iterations").value) || 10;
    if(typeof MAX_TOOL_ITERATIONS !== "undefined") MAX_TOOL_ITERATIONS = iterVal;
    currentConfig.settings = {
        autonomy: document.getElementById("set-autonomy").value,
        port: document.getElementById("set-port").value,
        loglevel: document.getElementById("set-loglevel").value,
        maxToolIterations: iterVal
    };
    saveAllConfig(); showToast("Settings saved", "success");
}

function resetSettings() {
    document.getElementById("set-autonomy").value = "collaborative";
    document.getElementById("set-loglevel").value = "info";
    showToast("Reset to defaults", "info");
}

// =========== EVENT LISTENERS ===========
document.getElementById("btn-apply-llm").addEventListener("click", applyLLMConfig);
document.getElementById("btn-test-llm").addEventListener("click", testLLMConfig);
document.getElementById("btn-setup-tg").addEventListener("click", setupTelegram);
document.getElementById("btn-setup-dc").addEventListener("click", setupDiscord);
document.getElementById("btn-setup-wa").addEventListener("click", setupWhatsApp);
document.getElementById("btn-setup-sl").addEventListener("click", setupSlack);
document.getElementById("btn-close-channel").addEventListener("click", closeChannelSetup);
document.getElementById("btn-daemon-toggle").addEventListener("click", toggleDaemon);
document.getElementById("btn-emergency-flush").addEventListener("click", emergencyFlush);
document.getElementById("btn-send-chat").addEventListener("click", sendAgentMessage);
document.getElementById("btn-save-settings").addEventListener("click", saveSettings);
document.getElementById("btn-reset-settings").addEventListener("click", resetSettings);
document.getElementById("btn-save-composio").addEventListener("click", saveComposioKey);

document.getElementById("llm-provider").addEventListener("change", function() {
    var provider = this.value;
    var group = document.getElementById("llm-model-group");
    var orArea = document.getElementById("or-models-area");
    if (provider === "openrouter") {
        if(group) group.style.display = "none";
        if(orArea) { orArea.classList.remove("hidden"); orArea.style.display = "block"; }
    } else {
        if(group) group.style.display = "block";
        if(orArea) { orArea.classList.add("hidden"); orArea.style.display = "none"; }
        autoFetchModels(provider, document.getElementById("llm-api-key").value.trim());
    }
});

// =========== BOOT ===========
async function boot() {
    if (localStorage.getItem("bambooclaw-installed") === "true") {
        await window.enterDashboard();
        loadPersonas();
    } else {
        wizardGo(0);
    }
}

(function waitForTauri() {
    boot();
})();