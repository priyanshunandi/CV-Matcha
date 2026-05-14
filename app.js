const state = {
  files: [],
  criteria: null,
  results: [],
  selectedId: null,
  skillInputs: { skills: [], niceToHaves: [] },
  decisions: {}
};

const pages = {
  upload: document.querySelector("#uploadPage"),
  filters: document.querySelector("#filtersPage"),
  results: document.querySelector("#resultsPage"),
  candidate: document.querySelector("#candidatePage")
};

const titles = {
  upload: "Upload CVs",
  filters: "Fill Filters",
  results: "Results Dashboard",
  candidate: "Candidate Preview"
};

const stepOrder = ["upload", "filters", "results", "candidate"];

const sampleCandidates = [
  {
    name: "Aarav Mehta",
    fileName: "Aarav-Mehta-Frontend-CV.txt",
    text: "Aarav Mehta Bengaluru Frontend Engineer with 5 years experience. Skilled in React, TypeScript, JavaScript, REST APIs, Jest, Testing Library, design systems, accessibility, HTML, CSS, GraphQL. Built dashboards for fintech products and worked with AWS cloud teams."
  },
  {
    name: "Nisha Rao",
    fileName: "Nisha-Rao-Fullstack-CV.txt",
    text: "Nisha Rao Remote India Software Engineer with 7 years experience. Skills include Node.js, React, TypeScript, AWS, PostgreSQL, REST APIs, microservices, CI/CD and product analytics. Led hiring panel and mentored engineers."
  },
  {
    name: "Kabir Sen",
    fileName: "Kabir-Sen-UI-CV.txt",
    text: "Kabir Sen Pune UI Developer with 3 years experience. Skills include JavaScript, Vue, CSS, HTML, responsive UI, Figma handoff and basic unit testing. Interested in design systems and component quality."
  }
];

function init() {
  restoreSession();
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  document.querySelector("#browseBtn").addEventListener("click", () => document.querySelector("#fileInput").click());
  document.querySelector("#fileInput").addEventListener("change", event => handleFiles(event.target.files));
  document.querySelector("#criteriaForm").addEventListener("submit", handleAnalyze);
  document.querySelector("#analyzeBtn").addEventListener("click", runAnalysis);
  document.querySelector("#sampleBtn").addEventListener("click", loadSamples);
  document.querySelector("#resetBtn").addEventListener("click", resetWorkspace);
  document.querySelector("#resultSearch").addEventListener("input", renderResults);
  setupSkillBuilder("skills");
  setupSkillBuilder("niceToHaves");
  hydrateCriteriaForm();

  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => showPage(button.dataset.go));
  });

  document.querySelectorAll("[data-step-link]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      showPage(link.dataset.stepLink);
    });
  });

  const dropzone = document.querySelector("#dropzone");
  ["dragenter", "dragover"].forEach(type => {
    dropzone.addEventListener(type, event => {
      event.preventDefault();
      dropzone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach(type => {
    dropzone.addEventListener(type, event => {
      event.preventDefault();
      dropzone.classList.remove("dragging");
    });
  });
  dropzone.addEventListener("drop", event => handleFiles(event.dataTransfer.files));
  dropzone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") document.querySelector("#fileInput").click();
  });

  if (window.lucide) window.lucide.createIcons();
  renderUploads();
  renderMetrics();
  renderResults();
}

function showPage(name) {
  Object.entries(pages).forEach(([key, page]) => page.classList.toggle("active", key === name));
  document.querySelectorAll("[data-step-link]").forEach(link => {
    link.classList.toggle("active", link.dataset.stepLink === name);
  });
  document.querySelector("#pageTitle").textContent = titles[name];
  updateStepProgress(name);
  window.location.hash = name;
}

function updateStepProgress(name) {
  const index = Math.max(0, stepOrder.indexOf(name));
  const stepText = document.querySelector("#stepText");
  const progressFill = document.querySelector("#progressFill");
  if (stepText) stepText.textContent = `Step ${index + 1} of ${stepOrder.length}`;
  if (progressFill) progressFill.style.width = `${((index + 1) / stepOrder.length) * 100}%`;
}
async function handleFiles(fileList) {
  const incoming = Array.from(fileList);
  for (const file of incoming) {
    const text = await readCvFile(file);
    state.files.push({
      id: crypto.randomUUID(),
      name: inferName(text, file.name),
      fileName: file.name,
      size: file.size,
      text,
      parseStatus: parseConfidence(text)
    });
  }
  renderUploads();
  saveSession();
}

async function readCvFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  try {
    if (extension === "pdf" && window.pdfjsLib) return await readPdf(file);
    if (extension === "docx" && window.mammoth) return await readDocx(file);
    return await file.text();
  } catch (error) {
    console.warn("Could not parse file", file.name, error);
    return `${file.name} ${file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")}`;
  }
}

async function readPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pagesText = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pagesText.push(content.items.map(item => item.str).join(" "));
  }
  return pagesText.join("\n");
}

async function readDocx(file) {
  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

function renderUploads() {
  const list = document.querySelector("#fileList");
  const count = document.querySelector("#uploadCount");
  count.textContent = `${state.files.length} ${state.files.length === 1 ? "file" : "files"}`;
  if (!state.files.length) {
    list.innerHTML = '<p class="empty-state">No CVs uploaded yet.</p>';
    return;
  }
  list.innerHTML = state.files.map(file => `
    <article class="file-row">
      <strong>${escapeHtml(file.name)}</strong>
      <span class="cv-file-name">${escapeHtml(file.fileName)}</span>
      <span class="cv-file-size">${formatSize(file.size)}</span>
      <span class="parse-pill ${parseClass(file.parseStatus)}">${escapeHtml(file.parseStatus)}</span>
    </article>
  `).join("");
}

function loadSamples() {
  state.files = sampleCandidates.map(candidate => ({
    id: crypto.randomUUID(),
    name: candidate.name,
    fileName: candidate.fileName,
    size: candidate.text.length,
    text: candidate.text,
    parseStatus: "Parsed"
  }));
  renderUploads();
  saveSession();
  showPage("filters");
}

function setupSkillBuilder(type) {
  const input = document.querySelector(`#${type}Input`);
  const addButton = document.querySelector(`[data-add-skill="${type}"]`);
  if (!input || !addButton) return;

  addButton.addEventListener("click", () => addSkillChip(type));
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      addSkillChip(type);
    }
  });
  renderSkillChips(type);
}

function addSkillChip(type) {
  const input = document.querySelector(`#${type}Input`);
  const value = input.value.trim();
  if (!value) return;
  const incoming = tokenize(value);
  incoming.forEach(item => {
    const exists = state.skillInputs[type].some(skill => normalize(skill) === normalize(item));
    if (!exists) state.skillInputs[type].push(item);
  });
  input.value = "";
  renderSkillChips(type);
  saveSession();
}

function removeSkillChip(type, value) {
  state.skillInputs[type] = state.skillInputs[type].filter(skill => skill !== value);
  renderSkillChips(type);
  saveSession();
}

function renderSkillChips(type) {
  const list = document.querySelector(`#${type}Chips`);
  const hidden = document.querySelector(`#${type}Hidden`);
  if (!list || !hidden) return;
  hidden.value = state.skillInputs[type].join(", ");
  list.innerHTML = state.skillInputs[type].length
    ? state.skillInputs[type].map(skill => `
      <span class="skill-chip">
        ${escapeHtml(skill)}
        <button type="button" aria-label="Remove ${escapeHtml(skill)}" data-remove-skill="${type}" data-value="${escapeHtml(skill)}">
          <i data-lucide="x"></i>
        </button>
      </span>
    `).join("")
    : '<span class="chip-empty">No items added yet.</span>';
  list.querySelectorAll("[data-remove-skill]").forEach(button => {
    button.addEventListener("click", () => removeSkillChip(button.dataset.removeSkill, button.dataset.value));
  });
  if (window.lucide) window.lucide.createIcons();
}

function syncSkillInputs() {
  ["skills", "niceToHaves"].forEach(type => {
    const input = document.querySelector(`#${type}Input`);
    if (input?.value.trim()) addSkillChip(type);
    renderSkillChips(type);
  });
}
function handleAnalyze(event) {
  event.preventDefault();
  runAnalysis();
}

function runAnalysis() {
  syncSkillInputs();
  if (!state.files.length) {
    showAnalyzeNotice("Upload at least one CV before running analysis.");
    showPage("filters");
    return;
  }
  showAnalyzeNotice("");
  const criteriaForm = document.querySelector("#criteriaForm");
  const form = new FormData(criteriaForm);
  state.criteria = {
    sessionName: form.get("sessionName").trim() || "Untitled review",
    role: form.get("role").trim() || "Open role",
    experience: form.get("experience"),
    location: form.get("location").trim(),
    skills: tokenize(form.get("skills")),
    niceToHaves: tokenize(form.get("niceToHaves")),
    skillWeight: Number(form.get("skillWeight")),
    experienceWeight: Number(form.get("experienceWeight"))
  };

  state.results = state.files.map(file => scoreCandidate(file, state.criteria))
    .sort((a, b) => b.score - a.score);

  renderMetrics();
  renderResults();
  saveSession();
  showPage("results");
}

function scoreCandidate(file, criteria) {
  const haystack = normalize(file.text);
  const matchedSkills = criteria.skills.filter(skill => haystack.includes(normalize(skill)));
  const matchedNice = criteria.niceToHaves.filter(skill => haystack.includes(normalize(skill)));
  const years = extractYears(file.text);
  const expScore = experienceScore(years, criteria.experience);
  const locationMatch = criteria.location ? haystack.includes(normalize(criteria.location)) : null;
  const locationScore = criteria.location ? (locationMatch ? 10 : 0) : 0;
  const roleScore = criteria.role && haystack.includes(normalize(criteria.role)) ? 8 : 2;
  const skillScore = criteria.skills.length ? (matchedSkills.length / criteria.skills.length) * criteria.skillWeight : criteria.skillWeight;
  const niceScore = criteria.niceToHaves.length ? (matchedNice.length / criteria.niceToHaves.length) * 12 : 8;
  const weightedExp = (expScore / 100) * criteria.experienceWeight;
  const score = Math.min(100, Math.round(skillScore + weightedExp + niceScore + locationScore + roleScore));

  return {
    ...file,
    score,
    years,
    matchedSkills,
    missedSkills: criteria.skills.filter(skill => !matchedSkills.includes(skill)),
    matchedNice,
    expScore,
    locationMatch,
    contact: extractContact(file.text),
    detectedLocation: detectLocation(file.text),
    components: {
      skills: Math.round(skillScore),
      experience: Math.round(weightedExp),
      niceToHave: Math.round(niceScore),
      location: Math.round(locationScore),
      role: Math.round(roleScore)
    },
    reasons: buildReasons(score, matchedSkills, matchedNice, years, criteria)
  };
}

function buildReasons(score, skills, nice, years, criteria) {
  const reasons = [];
  reasons.push(`${skills.length} of ${criteria.skills.length} must-have skills matched.`);
  reasons.push(years === null ? "Experience was not clearly detected." : `${years} years of experience detected.`);
  if (nice.length) reasons.push(`${nice.length} nice-to-have signal${nice.length === 1 ? "" : "s"} found.`);
  reasons.push(score >= 75 ? "Recommended for recruiter review." : score >= 50 ? "Worth a secondary screen." : "Lower fit against this filter set.");
  return reasons;
}

function renderMetrics() {
  const total = state.results.length;
  const strong = state.results.filter(result => result.score >= 75).length;
  const average = total ? Math.round(state.results.reduce((sum, result) => sum + result.score, 0) / total) : 0;
  document.querySelector("#metricCandidates").textContent = total;
  document.querySelector("#metricStrong").textContent = strong;
  document.querySelector("#metricAverage").textContent = `${average}%`;
  document.querySelector("#metricRequisition").textContent = state.criteria?.sessionName || "Draft";
}

function renderResults() {
  const body = document.querySelector("#resultsBody");
  const query = normalize(document.querySelector("#resultSearch").value || "");
  const filtered = state.results.filter(result => normalize(result.name).includes(query) || normalize(result.fileName).includes(query));
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-cell">No candidates match this view.</td></tr>';
    return;
  }
  body.innerHTML = filtered.map((result, index) => `
    <tr>
      <td>#${index + 1}</td>
      <td><strong class="candidate-name">${escapeHtml(result.name)}</strong><span class="candidate-file">${escapeHtml(result.fileName)}</span></td>
      <td>
        <span class="score-pill ${scoreClass(result.score)}">${result.score}%</span>
        <div class="score-bar" aria-hidden="true"><span style="width:${result.score}%"></span></div>
        <div class="score-breakdown">${renderBreakdown(result.components)}</div>
      </td>
      <td>${state.criteria.skills.length ? `${result.matchedSkills.length}/${state.criteria.skills.length}` : "Any"}</td>
      <td>${result.years === null ? "Unknown" : `${result.years} yrs`}</td>
      <td>${locationLabel(result.locationMatch)}</td>
      <td class="action-cell">
        <div class="decision-control" data-decision-group="${result.id}">
          ${renderDecisionButton(result.id, "Shortlist")}
          ${renderDecisionButton(result.id, "Maybe")}
          ${renderDecisionButton(result.id, "Reject")}
        </div>
        <button class="ghost-button preview-button" type="button" data-preview="${result.id}"><i data-lucide="eye"></i>Preview</button>
      </td>
    </tr>
  `).join("");
  body.querySelectorAll("[data-preview]").forEach(button => {
    button.addEventListener("click", () => openCandidate(button.dataset.preview));
  });
  body.querySelectorAll("[data-decision]").forEach(button => {
    button.addEventListener("click", () => setDecision(button.dataset.id, button.dataset.decision));
  });
  if (window.lucide) window.lucide.createIcons();
}

function openCandidate(id) {
  state.selectedId = id;
  const candidate = state.results.find(result => result.id === id);
  renderCandidate(candidate);
  showPage("candidate");
}

function renderCandidate(candidate) {
  const shell = document.querySelector("#candidateShell");
  if (!candidate) {
    shell.innerHTML = '<div class="panel"><p class="empty-state">Select a candidate from Results to preview details.</p></div>';
    return;
  }
  const initials = candidate.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  candidate.contact = candidate.contact || extractContact(candidate.text);
  candidate.components = candidate.components || {};
  shell.innerHTML = `
    <section class="panel candidate-hero">
      <div class="avatar">${escapeHtml(initials || "CV")}</div>
      <div>
        <p class="eyebrow">Candidate</p>
        <h2>${escapeHtml(candidate.name)}</h2>
        <p class="candidate-file-large">${escapeHtml(candidate.fileName)}</p>
      </div>
      <span class="score-pill ${scoreClass(candidate.score)}">${candidate.score}% match</span>
      <div class="score-bar candidate-score-bar" aria-hidden="true"><span style="width:${candidate.score}%"></span></div>
      <div class="score-breakdown detail-breakdown">${renderBreakdown(candidate.components)}</div>
      <div class="decision-control candidate-decisions">
        ${renderDecisionButton(candidate.id, "Shortlist")}
        ${renderDecisionButton(candidate.id, "Maybe")}
        ${renderDecisionButton(candidate.id, "Reject")}
      </div>
      <ul class="detail-list">
        <li class="tag">${candidate.years === null ? "Experience unknown" : `${candidate.years} years`}</li>
        <li class="tag">${locationLabel(candidate.locationMatch)}</li>
        <li class="tag">${escapeHtml(candidate.parseStatus || "Parsed")}</li>
      </ul>
      <button class="ghost-button" type="button" data-go-results><i data-lucide="arrow-left"></i>Back to results</button>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Ranking detail</p>
          <h2>Why this rank</h2>
        </div>
      </div>
      <div class="info-grid">
        <div><span>Email</span><strong>${escapeHtml(candidate.contact.email || "Not found")}</strong></div>
        <div><span>Phone</span><strong>${escapeHtml(candidate.contact.phone || "Not found")}</strong></div>
        <div><span>Detected location</span><strong>${escapeHtml(candidate.detectedLocation || "Not found")}</strong></div>
        <div><span>Parse confidence</span><strong>${escapeHtml(candidate.parseStatus || "Parsed")}</strong></div>
      </div>
      <ul class="reason-list">${candidate.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
      <h3>Matched skills</h3>
      <ul class="tag-list">${renderTags(candidate.matchedSkills, "No must-have skills matched")}</ul>
      <h3>Missed skills</h3>
      <ul class="tag-list">${renderTags(candidate.missedSkills, "No missed must-have skills")}</ul>
      <h3>Nice-to-have signals</h3>
      <ul class="tag-list">${renderTags(candidate.matchedNice, "No nice-to-have signals found")}</ul>
      <h3>CV text preview</h3>
      <div class="snippet">${escapeHtml(candidate.text.slice(0, 1400))}</div>
    </section>
  `;
  shell.querySelector("[data-go-results]").addEventListener("click", () => showPage("results"));
  shell.querySelectorAll("[data-decision]").forEach(button => {
    button.addEventListener("click", () => setDecision(button.dataset.id, button.dataset.decision));
  });
  if (window.lucide) window.lucide.createIcons();
}

function showAnalyzeNotice(message) {
  let notice = document.querySelector("#analyzeNotice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "analyzeNotice";
    notice.className = "inline-notice";
    document.querySelector("#criteriaForm")?.prepend(notice);
  }
  notice.textContent = message;
  notice.classList.toggle("active", Boolean(message));
}

function parseConfidence(text) {
  const length = String(text || "").trim().length;
  if (length > 450) return "Parsed";
  if (length > 80) return "Text limited";
  return "Could not read";
}

function parseClass(status) {
  return String(status || "").toLowerCase().replace(/\s+/g, "-");
}

function renderBreakdown(components = {}) {
  return [
    ["Skills", components.skills],
    ["Exp", components.experience],
    ["Nice", components.niceToHave],
    ["Loc", components.location]
  ].map(([label, value]) => `<span>${label} ${Math.max(0, Number(value || 0))}</span>`).join("");
}

function renderDecisionButton(id, decision) {
  const active = state.decisions[id] === decision ? " active" : "";
  return `<button class="decision-button${active}" type="button" data-id="${id}" data-decision="${decision}">${decision}</button>`;
}

function setDecision(id, decision) {
  state.decisions[id] = state.decisions[id] === decision ? "" : decision;
  if (!state.decisions[id]) delete state.decisions[id];
  renderResults();
  const candidate = state.results.find(result => result.id === state.selectedId);
  if (candidate && pages.candidate.classList.contains("active")) renderCandidate(candidate);
  saveSession();
}

function extractContact(text) {
  const source = String(text || "");
  const email = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = source.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.replace(/\s+/g, " ").trim() || "";
  return { email, phone };
}

function detectLocation(text) {
  const source = String(text || "");
  const known = ["Bengaluru", "Bangalore", "Mumbai", "Delhi", "Gurugram", "Gurgaon", "Noida", "Pune", "Hyderabad", "Chennai", "Kolkata", "Remote", "Patna", "Durgapur", "Asansol"];
  return known.find(location => new RegExp(`\\b${location}\\b`, "i").test(source)) || "";
}

function hydrateCriteriaForm() {
  if (!state.criteria) return;
  const form = document.querySelector("#criteriaForm");
  if (!form) return;
  form.elements.sessionName.value = state.criteria.sessionName || "";
  form.elements.role.value = state.criteria.role || "";
  form.elements.experience.value = state.criteria.experience || "4-7";
  form.elements.location.value = state.criteria.location || "";
  form.elements.skillWeight.value = state.criteria.skillWeight || 60;
  form.elements.experienceWeight.value = state.criteria.experienceWeight || 25;
  renderSkillChips("skills");
  renderSkillChips("niceToHaves");
}
function saveSession() {
  try {
    localStorage.setItem("cvMatchaSession", JSON.stringify({
      files: state.files,
      criteria: state.criteria,
      results: state.results,
      selectedId: state.selectedId,
      skillInputs: state.skillInputs,
      decisions: state.decisions
    }));
  } catch (error) {
    console.warn("Could not save session", error);
  }
}

function restoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem("cvMatchaSession") || "null");
    if (!saved) return;
    state.files = Array.isArray(saved.files) ? saved.files : [];
    state.criteria = saved.criteria || null;
    state.results = Array.isArray(saved.results) ? saved.results : [];
    state.selectedId = saved.selectedId || null;
    state.skillInputs = saved.skillInputs || { skills: [], niceToHaves: [] };
    state.decisions = saved.decisions || {};
  } catch (error) {
    console.warn("Could not restore session", error);
  }
}
function renderTags(items, fallback) {
  if (!items.length) return `<li class="tag">${fallback}</li>`;
  return items.map(item => `<li class="tag">${escapeHtml(item)}</li>`).join("");
}

function resetWorkspace() {
  state.files = [];
  state.criteria = null;
  state.results = [];
  state.selectedId = null;
  state.decisions = {};
  document.querySelector("#criteriaForm").reset();
  state.skillInputs = { skills: [], niceToHaves: [] };
  renderSkillChips("skills");
  renderSkillChips("niceToHaves");
  document.querySelector("#resultSearch").value = "";
  renderUploads();
  renderMetrics();
  renderResults();
  renderCandidate(null);
  showAnalyzeNotice("");
  localStorage.removeItem("cvMatchaSession");
  showPage("upload");
}

function tokenize(value) {
  return String(value || "")
    .split(/[,;\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9+#.\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function inferName(text, fileName) {
  const cleanFile = fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
  const source = String(text || cleanFile).replace(/\s+/g, " ").trim();
  const upperMatch = source.match(/^([A-Z]{2,}(?:\s+[A-Z]{2,}){1,2})\b/);
  if (upperMatch) return toNameCase(upperMatch[1]);
  const beforeCvSection = source.split(/\b(?:profile|summary|objective|phone|email|mobile|experience|education|skills)\b/i)[0];
  const words = beforeCvSection.replace(/[^a-zA-Z\s.]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return words.slice(0, Math.min(3, words.length)).join(" ") || cleanFile;
}

function toNameCase(value) {
  return String(value).toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

function locationLabel(match) {
  if (match === null) return "Any";
  return match ? "Matched" : "Not found";
}

function extractYears(text) {
  const normalized = String(text || "").toLowerCase();
  const explicit = normalized.match(/(\d{1,2})\+?\s*(?:years|yrs|year)/);
  if (explicit) return Number(explicit[1]);
  const ranges = [...normalized.matchAll(/\b(20\d{2})\s*[-â€“]\s*(20\d{2}|present|current)\b/g)];
  if (!ranges.length) return null;
  return ranges.reduce((total, match) => {
    const start = Number(match[1]);
    const end = /\d{4}/.test(match[2]) ? Number(match[2]) : new Date().getFullYear();
    return total + Math.max(0, end - start);
  }, 0);
}

function experienceScore(years, range) {
  if (years === null) return 45;
  const [min, max] = range.split("-").map(Number);
  if (years >= min && years <= max) return 100;
  const distance = years < min ? min - years : years - max;
  return Math.max(25, 100 - distance * 18);
}

function scoreClass(score) {
  if (score >= 75) return "strong";
  if (score >= 50) return "medium";
  return "low";
}

function formatSize(bytes) {
  if (!bytes) return "sample";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.addEventListener("DOMContentLoaded", init);










