// =========== PERSONA MANAGEMENT ===========
var personas = [];
var activePersonaIndex = -1;

function loadPersonas() {
    try {
        var saved = localStorage.getItem("bambooclaw-personas");
        if (saved) personas = JSON.parse(saved);
    } catch(e) {}
    var activeIdx = localStorage.getItem("bambooclaw-active-persona");
    activePersonaIndex = activeIdx !== null ? parseInt(activeIdx) : -1;
    renderPersonas();
}

function savePersonas() {
    localStorage.setItem("bambooclaw-personas", JSON.stringify(personas));
    localStorage.setItem("bambooclaw-active-persona", String(activePersonaIndex));
}

function renderPersonas() {
    var sel = document.getElementById("set-identity");
    if (sel) {
        sel.innerHTML = '<option value="-1">— BambooClaw Default —</option>';
        personas.forEach(function(p, i) {
            var opt = document.createElement("option");
            opt.value = i;
            opt.textContent = p.name;
            if (i === activePersonaIndex) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.value = activePersonaIndex >= 0 ? activePersonaIndex : -1;
    }

    var listEl = document.getElementById("persona-list");
    if (!listEl) return;
    if (personas.length === 0) {
        listEl.innerHTML = '<p style="font-size:0.8rem;color:var(--text-dim);padding:0.5rem 0;">No personas created yet.</p>';
        return;
    }
    var html = '';
    personas.forEach(function(p, i) {
        var isActive = i === activePersonaIndex;
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0.75rem;border:1px solid ' + (isActive ? 'var(--accent)' : 'var(--border)') + ';border-radius:6px;margin-bottom:0.5rem;background:' + (isActive ? 'rgba(16,185,129,0.05)' : 'transparent') + ';">';
        html += '<div style="flex:1;"><span style="font-weight:600;font-size:0.85rem;">' + escapeHtml(p.name) + '</span>';
        html += '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:0.2rem;max-height:40px;overflow:hidden;">' + escapeHtml(p.prompt).substring(0, 120) + (p.prompt.length > 120 ? '...' : '') + '</div></div>';
        html += '<div style="display:flex;gap:0.5rem;margin-left:0.75rem;">';
        html += '<button class="btn btn-sm btn-outline" id="btn-edit-persona-' + i + '" style="padding:0.3rem 0.6rem;font-size:0.75rem;">✎</button>';
        html += '<button class="btn btn-sm btn-outline" id="btn-del-persona-' + i + '" style="padding:0.3rem 0.6rem;font-size:0.75rem;color:var(--error);border-color:var(--error);">✕</button>';
        html += '</div></div>';
    });
    listEl.innerHTML = html;
    personas.forEach(function(p, i) {
        var editBtn = document.getElementById('btn-edit-persona-' + i);
        if (editBtn) editBtn.addEventListener("click", function() { editPersona(i); });
        var delBtn = document.getElementById('btn-del-persona-' + i);
        if (delBtn) delBtn.addEventListener("click", function() { deletePersona(i); });
    });
}

var editingPersonaIndex = -1;

function editPersona(idx) {
    var p = personas[idx];
    var nameEl = document.getElementById("new-persona-name");
    var promptEl = document.getElementById("new-persona-prompt");
    if (nameEl) nameEl.value = p.name;
    if (promptEl) promptEl.value = p.prompt;
    var btn = document.getElementById("btn-create-persona");
    if (btn) btn.textContent = "Update Persona";
    editingPersonaIndex = idx;
    var detailsBlock = document.getElementById("persona-details-block");
    if (detailsBlock) detailsBlock.open = true;
}

function createPersona() {
    var nameEl = document.getElementById("new-persona-name");
    var promptEl = document.getElementById("new-persona-prompt");
    var name = nameEl ? nameEl.value.trim() : "";
    var prompt = promptEl ? promptEl.value.trim() : "";
    if (!name) { showToast("Please enter a persona name", "error"); return; }
    if (!prompt) { showToast("Please enter a persona prompt", "error"); return; }
    if (editingPersonaIndex >= 0) {
        personas[editingPersonaIndex] = { name: name, prompt: prompt };
        showToast("Persona '" + name + "' updated", "success");
        editingPersonaIndex = -1;
        var btn = document.getElementById("btn-create-persona");
        if (btn) btn.textContent = "Create Persona";
    } else {
        personas.push({ name: name, prompt: prompt });
        showToast("Persona '" + name + "' created", "success");
    }
    savePersonas();
    renderPersonas();
    if (nameEl) nameEl.value = "";
    if (promptEl) promptEl.value = "";
}

function deletePersona(idx) {
    if (idx < 0 || idx >= personas.length) return;
    var name = personas[idx].name;
    if (!confirm("Are you sure you want to delete the persona '" + name + "'?")) return;
    personas.splice(idx, 1);
    if (activePersonaIndex === idx) activePersonaIndex = -1;
    else if (activePersonaIndex > idx) activePersonaIndex--;
    savePersonas();
    renderPersonas();
    showToast("Persona '" + name + "' deleted", "info");
}

// =========== SETTINGS ===========
async function saveSettings() {
    appendLog("dash-log", "[SETTINGS] saveSettings() called");
    var iterVal = parseInt(document.getElementById("set-tool-iterations").value) || 10;
    MAX_TOOL_ITERATIONS = iterVal;
    var identVal = document.getElementById("set-identity").value;
    currentConfig.settings = {
        autonomy: document.getElementById("set-autonomy").value,
        identity: identVal,
        loglevel: document.getElementById("set-loglevel").value,
        maxToolIterations: iterVal
    };
    if (!currentConfig.llm) currentConfig.llm = { provider: "openai", api_key: "", model: "" };
    saveAllConfig();
    savePersonas();
    showToast("Settings saved", "success");
    var sr = document.getElementById("settings-save-reminder");
    if (sr) sr.classList.remove("visible");
}

function resetSettings() {
    document.getElementById("set-autonomy").value = "collaborative";
    document.getElementById("set-identity").value = "-1";
    document.getElementById("set-loglevel").value = "info";
    document.getElementById("set-tool-iterations").value = "10";
    document.getElementById("tool-iter-value").textContent = "10";
    MAX_TOOL_ITERATIONS = 10;
    showToast("Settings reset to defaults", "info");
}