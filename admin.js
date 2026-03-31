const SUPABASE_URL = "https://skfqoyyoahuaffshimnc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_yxLCOU94zhGck9yvGYch5Q_ePCPd9Yq";
const sb = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage }
});

let currentAdminId = null;

const loginSection = document.getElementById("loginSection");
const adminSection = document.getElementById("adminSection");
const adminEmail = document.getElementById("adminEmail");
const adminPassword = document.getElementById("adminPassword");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const loginError = document.getElementById("loginError");
const verificationList = document.getElementById("verificationList");
const validatedList = document.getElementById("validatedList");
const logoutBtn = document.querySelector("[data-logout]");

// ---- AUTH ----
async function init() {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user;
  if (user && user.user_metadata?.role === "admin") {
    currentAdminId = user.id;
    showAdmin();
    await loadAll();
  }
}
init();

adminLoginBtn?.addEventListener("click", async function() {
  var email = adminEmail.value.trim();
  var password = adminPassword.value;
  if (!email || !password) { showError("Remplissez tous les champs."); return; }
  adminLoginBtn.textContent = "Connexion...";
  adminLoginBtn.disabled = true;

  var { data, error } = await sb.auth.signInWithPassword({ email: email, password: password });
  adminLoginBtn.textContent = "Se connecter";
  adminLoginBtn.disabled = false;

  if (error) { showError("Erreur : " + error.message); return; }
  var user = data?.user;
  if (!user || user.user_metadata?.role !== "admin") {
    await sb.auth.signOut();
    showError("Ce compte n'a pas les droits administrateur.");
    return;
  }
  currentAdminId = user.id;
  showAdmin();
  await loadAll();
});

adminPassword?.addEventListener("keydown", function(e) {
  if (e.key === "Enter") adminLoginBtn?.click();
});

function showError(msg) {
  if (loginError) { loginError.textContent = msg; loginError.style.display = "block"; }
}

function showAdmin() {
  if (loginSection) loginSection.style.display = "none";
  if (adminSection) adminSection.style.display = "block";
  if (logoutBtn) logoutBtn.style.display = "inline-flex";
}

// ---- LOGOUT ----
document.querySelectorAll("[data-logout]").forEach(function(b) {
  b.addEventListener("click", async function(e) {
    e.preventDefault();
    try { await sb.auth.signOut(); } catch (_) {}
    Object.keys(localStorage).forEach(function(k) {
      if (k.indexOf("sb-") !== -1 && k.indexOf("-auth-token") !== -1) localStorage.removeItem(k);
    });
    window.location.reload();
  });
});

// ---- LOAD DATA ----
async function loadAll() {
  await loadVerificationMissions();
  await loadValidatedMissions();
  setupRealtime();
}

async function loadVerificationMissions() {
  if (!verificationList) return;
  var result = await sb.from("requests")
    .select("id,title,description,category,budget,negotiated_price,skills,spec_checklist,assigned_indep_user_id,client_user_id,delivered_at")
    .eq("status", "verification")
    .order("delivered_at", { ascending: false });
  var data = result.data;
  if (result.error || !data || data.length === 0) {
    verificationList.innerHTML = '<p class="hint">Aucune mission en attente de vérification.</p>';
    return;
  }
  var html = "";
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    html += await renderVerificationCard(r);
  }
  verificationList.innerHTML = html;

  // Bind validate buttons
  document.querySelectorAll("[data-validate]").forEach(function(btn) {
    btn.addEventListener("click", function() { validateMission(btn.dataset.validate); });
  });
}

async function renderVerificationCard(r) {
  // Load deliverables
  var delResult = await sb.from("deliverables").select("file_name,file_size,file_url,uploaded_at")
    .eq("request_id", r.id).order("uploaded_at", { ascending: false });
  var deliverables = delResult.data || [];

  var filesHtml = "";
  if (deliverables.length === 0) {
    filesHtml = '<p class="hint">Aucun fichier livré.</p>';
  } else {
    deliverables.forEach(function(f) {
      var size = f.file_size ? (f.file_size / 1024).toFixed(1) + " Ko" : "";
      filesHtml += '<div class="file-item"><span>' + f.file_name + '</span><span class="hint">' + size + '</span></div>';
    });
  }

  var deliveredDate = r.delivered_at ? new Date(r.delivered_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  return '<div class="mission-card">' +
    '<h4>' + r.title + ' <span class="pill yellow">Vérification</span></h4>' +
    '<div class="detail-row"><span class="dl">Catégorie</span><span class="dd">' + (r.category || "—") + '</span></div>' +
    '<div class="detail-row"><span class="dl">Prix négocié</span><span class="dd">' + (r.negotiated_price || r.budget || "—") + ' €</span></div>' +
    '<div class="detail-row"><span class="dl">Compétences</span><span class="dd">' + (r.skills || "—") + '</span></div>' +
    '<div class="detail-row"><span class="dl">Livré le</span><span class="dd">' + deliveredDate + '</span></div>' +
    (r.description ? '<div class="detail-row"><span class="dl">Description</span><span class="dd" style="max-width:60%;text-align:right">' + r.description + '</span></div>' : '') +
    (r.spec_checklist ? '<div class="detail-row"><span class="dl">Cahier des charges</span><span class="dd" style="max-width:60%;text-align:right;white-space:pre-wrap">' + r.spec_checklist + '</span></div>' : '') +
    '<div style="margin-top:12px"><strong style="font-size:13px">Livrables :</strong></div>' +
    filesHtml +
    '<div style="margin-top:14px;display:flex;gap:8px">' +
    '<button class="btn primary" data-validate="' + r.id + '">Valider la vérification</button>' +
    '</div></div>';
}

async function validateMission(requestId) {
  var ok = window.confirm("Valider cette mission ? Le client recevra les livrables et la mission sera marquée comme terminée.");
  if (!ok) return;

  var result = await sb.from("requests").update({
    status: "termine"
  }).eq("id", requestId).eq("status", "verification");

  if (result.error) {
    alert("Erreur lors de la validation : " + result.error.message);
    return;
  }

  await sb.from("request_messages").insert({
    request_id: requestId,
    sender_user_id: currentAdminId,
    sender_role: "system",
    channel: "fil",
    body: "L'administrateur a validé les livrables. Mission terminée ✅"
  }).catch(function(){});

  alert("Mission validée avec succès !");
  await loadAll();
}

async function loadValidatedMissions() {
  if (!validatedList) return;
  var result = await sb.from("requests")
    .select("id,title,category,negotiated_price,budget,delivered_at")
    .eq("status", "termine")
    .not("delivered_at", "is", null)
    .order("delivered_at", { ascending: false }).limit(10);
  var data = result.data;
  if (result.error || !data || data.length === 0) {
    validatedList.innerHTML = '<p class="hint">Aucune mission validée récemment.</p>';
    return;
  }
  validatedList.innerHTML = data.map(function(r) {
    var date = r.delivered_at ? new Date(r.delivered_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);margin-bottom:6px">' +
      '<div><span style="font-weight:700;font-size:14px">' + r.title + '</span> <span class="hint">· ' + (r.category || "") + '</span></div>' +
      '<div><span class="pill green">Terminé</span> <span class="hint" style="margin-left:8px">' + date + '</span></div></div>';
  }).join("");
}

// ---- REALTIME ----
function setupRealtime() {
  sb.channel("admin-verification")
    .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, function() {
      loadAll();
    })
    .subscribe();
}
