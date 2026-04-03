const SUPABASE_URL = "https://skfqoyyoahuaffshimnc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrZnFveXlvYWh1YWZmc2hpbW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTgwNDUsImV4cCI6MjA4NTEzNDA0NX0.2bC5-h7QpooJIHaci6CvRT5qG-XcKj2HQe1ZI5CDD1E";
const sb = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage }
});

let currentUserId = null;
let currentIndep = null;
let currentRequest = null;
let isOnline = false;
let notifTimer = null;
let notifInterval = null;
let realtimeChannel = null;
let selectedRating = 0;
let deadlineInterval = null;

// DOM
const welcomeTitle = document.getElementById("welcomeTitle");
const statusBadge = document.getElementById("statusBadge");
const kpiRevenue = document.getElementById("kpiRevenue");
const kpiRate = document.getElementById("kpiRate");
const kpiMissions = document.getElementById("kpiMissions");
const kpiRating = document.getElementById("kpiRating");
const categorySelect = document.getElementById("categorySelect");
const toggleOnline = document.getElementById("toggleOnline");
const searchBtn = document.getElementById("searchBtn");
const availFeedback = document.getElementById("availFeedback");
const profileCity = document.getElementById("profileCity");
const profileExp = document.getElementById("profileExp");
const profileSkills = document.getElementById("profileSkills");
const profileSiret = document.getElementById("profileSiret");
const missionList = document.getElementById("missionList");
const missionDetailCard = document.getElementById("missionDetailCard");
const missionDetail = document.getElementById("missionDetail");
const deadlineCountdown = document.getElementById("deadlineCountdown");
const fileZone = document.getElementById("fileZone");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const deliverBtn = document.getElementById("deliverBtn");
const chatList = document.getElementById("chatList");
const chatTitle = document.getElementById("chatTitle");
const chatStatusText = document.getElementById("chatStatusText");
const chatHint = document.getElementById("chatHint");
const chatMessages = document.getElementById("chatMessages");
const chatHeaderActions = document.getElementById("chatHeaderActions");
const chatInputArea = document.getElementById("chatInputArea");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const negoBar = document.getElementById("negoBar");
const priceInput = document.getElementById("priceInput");
const proposePriceBtn = document.getElementById("proposePriceBtn");
const notifPopup = document.getElementById("notifPopup");
const notifDetails = document.getElementById("notifDetails");
const notifTimerBar = document.getElementById("notifTimer");
const notifCountdownEl = document.getElementById("notifCountdown");
const notifAccept = document.getElementById("notifAccept");
const notifDecline = document.getElementById("notifDecline");
const ratingModal = document.getElementById("ratingModal");
const ratingStarsEl = document.getElementById("ratingStars");
const ratingComment = document.getElementById("ratingComment");
const submitRatingBtn = document.getElementById("submitRating");
const skipRatingBtn = document.getElementById("skipRating");
const availableRequests = document.getElementById("availableRequests");
const applyModal = document.getElementById("applyModal");
const applyPriceInput = document.getElementById("applyPriceInput");
const applyMessageInput = document.getElementById("applyMessageInput");
const confirmApplyBtn = document.getElementById("confirmApplyBtn");
const cancelApplyBtn = document.getElementById("cancelApplyBtn");
const applyMissionDetails = document.getElementById("applyMissionDetails");
const applyStatusText = document.getElementById("applyStatusText");
let pendingApplyRequest = null;
let availableRequestMap = {};

async function ensureIndepProfile(user, forceRefresh) {
  if (!sb) return null;
  var resolvedUser = user || null;
  if (!resolvedUser) {
    var authUserResult = await sb.auth.getUser();
    resolvedUser = authUserResult && authUserResult.data ? authUserResult.data.user : null;
  }
  if (!resolvedUser?.id) return null;
  if (currentIndep && !forceRefresh) return currentIndep;

  var profileResult = await sb.from("independants")
    .select("firstname,lastname,city,experience,skills,daily_rate,status,siret,phone")
    .eq("user_id", resolvedUser.id).maybeSingle();

  if (!profileResult.error && profileResult.data) {
    currentIndep = profileResult.data;
    return currentIndep;
  }

  var meta = resolvedUser.user_metadata || {};
  var fallbackProfile = {
    firstname: meta.firstname || "",
    lastname: meta.lastname || "",
    city: "", experience: "", skills: "",
    daily_rate: null, status: "hors_ligne", siret: "", phone: ""
  };

  var createResult = await sb.from("independants").upsert({
    user_id: resolvedUser.id,
    firstname: fallbackProfile.firstname,
    lastname: fallbackProfile.lastname,
    email: resolvedUser.email || "",
    status: "hors_ligne"
  }, { onConflict: "user_id" });

  if (createResult.error) {
    console.warn("Profil indépendant absent:", createResult.error.message);
    currentIndep = fallbackProfile;
    return currentIndep;
  }

  var refetch = await sb.from("independants")
    .select("firstname,lastname,city,experience,skills,daily_rate,status,siret,phone")
    .eq("user_id", resolvedUser.id).maybeSingle();

  currentIndep = refetch.data || fallbackProfile;
  return currentIndep;
}

// ---- INIT ----
async function init() {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) { window.location.href = "connexion.html"; return; }
  if (user.user_metadata?.role && user.user_metadata.role !== "independant") {
    await sb.auth.signOut(); window.location.href = "connexion.html"; return;
  }
  currentUserId = user.id;
  const data = await ensureIndepProfile(user);
  const name = [data?.firstname, data?.lastname].filter(Boolean).join(" ");
  if (welcomeTitle) welcomeTitle.textContent = name ? "Bonjour " + name : "Tableau de bord";

  if (profileCity) profileCity.textContent = data?.city || "—";
  if (profileExp) profileExp.textContent = data?.experience || "—";
  if (profileSkills) profileSkills.textContent = data?.skills || "—";
  if (profileSiret) profileSiret.textContent = data?.siret || "—";
  if (kpiRate) kpiRate.textContent = data?.daily_rate ? data.daily_rate + " €/j" : "—";

  var stored = localStorage.getItem("indep-category");
  if (stored && categorySelect) categorySelect.value = stored;

  isOnline = data?.status === "en_ligne";
  updateStatusUI();
  await refreshAll();
  setupRealtime();

  // Handle Stripe Connect return
  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("stripe") === "success") {
    alert("Compte de paiement configuré avec succès ! Vous pouvez maintenant recevoir des virements.");
    window.history.replaceState({}, "", "indep-dashboard.html");
  } else if (urlParams.get("stripe") === "refresh") {
    alert("La configuration n'est pas terminée. Cliquez sur 'Configurer' pour reprendre.");
    window.history.replaceState({}, "", "indep-dashboard.html");
  }
}
init();

// ---- LOGOUT ----
document.querySelectorAll("[data-logout]").forEach(function(b) {
  b.addEventListener("click", async function(e) {
    e.preventDefault();
    if (isOnline) await updateStatus("hors_ligne");
    try { await sb.auth.signOut(); } catch (err) {}
    Object.keys(localStorage).forEach(function(k) {
      if (k.indexOf("sb-") !== -1 && k.indexOf("-auth-token") !== -1) localStorage.removeItem(k);
    });
    window.location.href = "index.html";
  });
});

document.addEventListener("visibilitychange", function() {
  if (document.hidden && isOnline) updateStatus("hors_ligne");
});
window.addEventListener("beforeunload", function() {
  if (isOnline) updateStatus("hors_ligne");
});

// ---- STATUS ----
function updateStatusUI() {
  var dot = statusBadge ? statusBadge.querySelector(".status-dot") : null;
  if (dot) dot.className = "status-dot " + (isOnline ? "online" : "offline");
  if (statusBadge && statusBadge.childNodes[1]) statusBadge.childNodes[1].textContent = isOnline ? " En ligne" : " Hors ligne";
  if (toggleOnline) {
    toggleOnline.textContent = isOnline ? "Se mettre hors ligne" : "Se mettre en ligne";
    toggleOnline.className = isOnline ? "btn danger" : "btn primary";
    toggleOnline.style.flex = "1";
  }
  if (availFeedback) availFeedback.textContent = isOnline ? "Vous recevez les demandes en temps réel." : "Passez en ligne pour recevoir des demandes.";
}

async function updateStatus(status) {
  if (!sb || !currentUserId) return;
  await sb.from("independants").update({ status: status }).eq("user_id", currentUserId);
}

if (toggleOnline) {
  toggleOnline.addEventListener("click", async function() {
    if (!categorySelect.value && !isOnline) { alert("Choisissez une catégorie."); return; }
    if (categorySelect.value) localStorage.setItem("indep-category", categorySelect.value);
    var next = isOnline ? "hors_ligne" : "en_ligne";
    await updateStatus(next);
    isOnline = !isOnline;
    updateStatusUI();
    if (isOnline) checkPendingNotifications();
  });
}

if (searchBtn) {
  searchBtn.addEventListener("click", async function() {
    if (!categorySelect.value) { alert("Choisissez une catégorie."); return; }
    localStorage.setItem("indep-category", categorySelect.value);
    if (availFeedback) availFeedback.textContent = "Recherche en cours...";
    await loadAvailableRequests();
    if (availFeedback) availFeedback.textContent = "Recherche terminée.";
  });
}

// ---- DATA ----
async function refreshAll() {
  await loadMissions().catch(function(){});
  await loadKPIs().catch(function(){});
  await loadUserRating().catch(function(){});
  await loadAvailableRequests().catch(function(){});
  await loadEarnings().catch(function(){});
}

async function loadKPIs() {
  var result = await sb.from("requests")
    .select("id,status,negotiated_price").eq("assigned_indep_user_id", currentUserId)
    .in("status", ["en_cours", "termine", "verification", "negociation"]);
  var data = result.data || [];
  var active = data.filter(function(r) { return ["en_cours", "negociation"].indexOf(r.status) !== -1; });
  if (kpiMissions) kpiMissions.textContent = active.length;
  var rev = data.filter(function(r) { return ["en_cours", "termine", "verification"].indexOf(r.status) !== -1; })
    .reduce(function(s, r) { return s + Number(r.negotiated_price || 0); }, 0);
  if (kpiRevenue) kpiRevenue.textContent = rev + " €";
}

async function loadUserRating() {
  var result = await sb.from("ratings").select("score").eq("rated_user_id", currentUserId);
  var data = result.data;
  if (!data || data.length === 0) { if (kpiRating) kpiRating.textContent = "—"; return; }
  var avg = data.reduce(function(s, r) { return s + Number(r.score); }, 0) / data.length;
  if (kpiRating) kpiRating.textContent = avg.toFixed(1) + " / 10";
}

// ---- EARNINGS & PAYOUTS ----
async function loadEarnings() {
  var kpiAvailable = document.getElementById("kpiAvailable");
  var kpiPending = document.getElementById("kpiPending");
  var kpiPaidOut = document.getElementById("kpiPaidOut");
  var stripeAccountStatus = document.getElementById("stripeAccountStatus");
  var payoutMissionsList = document.getElementById("payoutMissionsList");

  // Get all missions assigned to this indep
  var { data: missions } = await sb.from("requests")
    .select("id,title,status,negotiated_price,budget,completed_at")
    .eq("assigned_indep_user_id", currentUserId)
    .in("status", ["en_cours", "verification", "termine"]);
  missions = missions || [];

  // Get existing payouts
  var { data: payouts } = await sb.from("payouts")
    .select("request_id,status,net_amount")
    .eq("indep_user_id", currentUserId);
  payouts = payouts || [];

  var paidRequestIds = payouts.filter(function(p) { return p.status === "completed"; }).map(function(p) { return p.request_id; });
  var totalPaidOut = payouts.filter(function(p) { return p.status === "completed"; }).reduce(function(s, p) { return s + Number(p.net_amount || 0); }, 0);

  var PAYOUT_DELAY_MS = 3 * 24 * 60 * 60 * 1000; // 3 jours en ms
  var now = Date.now();

  // Terminé + not yet paid out
  var termineMissions = missions.filter(function(m) { return m.status === "termine" && paidRequestIds.indexOf(m.id) === -1; });

  // Split into: ready (3 days passed) vs waiting (still in delay)
  var availableMissions = termineMissions.filter(function(m) {
    var completedAt = m.completed_at ? new Date(m.completed_at).getTime() : 0;
    return completedAt > 0 && (now - completedAt) >= PAYOUT_DELAY_MS;
  });
  var waitingMissions = termineMissions.filter(function(m) {
    var completedAt = m.completed_at ? new Date(m.completed_at).getTime() : 0;
    return !completedAt || (now - completedAt) < PAYOUT_DELAY_MS;
  });

  var availableAmount = availableMissions.reduce(function(s, m) {
    var price = Number(m.negotiated_price || m.budget || 0);
    return s + Math.round((price - price * 0.02) * 100) / 100;
  }, 0);

  var waitingAmount = waitingMissions.reduce(function(s, m) {
    var price = Number(m.negotiated_price || m.budget || 0);
    return s + Math.round((price - price * 0.02) * 100) / 100;
  }, 0);

  // Pending = en_cours + verification + waiting (3-day delay)
  var pendingMissions = missions.filter(function(m) { return ["en_cours", "verification"].indexOf(m.status) !== -1; });
  var pendingAmount = pendingMissions.reduce(function(s, m) {
    var price = Number(m.negotiated_price || m.budget || 0);
    return s + Math.round((price - price * 0.02) * 100) / 100;
  }, 0) + waitingAmount;

  if (kpiAvailable) kpiAvailable.textContent = availableAmount.toFixed(2) + " €";
  if (kpiPending) kpiPending.textContent = pendingAmount.toFixed(2) + " €";
  if (kpiPaidOut) kpiPaidOut.textContent = totalPaidOut.toFixed(2) + " €";

  // Stripe account status
  if (stripeAccountStatus) {
    var { data: indepProfile } = await sb.from("independants")
      .select("stripe_account_id").eq("user_id", currentUserId).maybeSingle();

    var hasStripe = indepProfile && indepProfile.stripe_account_id;

    if (!hasStripe) {
      stripeAccountStatus.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:12px;border-radius:12px;border:1px solid rgba(251,191,36,.3);background:rgba(251,191,36,.08)"><span style="font-size:18px">&#x26a0;&#xfe0f;</span><div><div style="font-weight:700;font-size:13px;color:#fde68a">Compte de paiement non configuré</div><div class="hint">Configurez votre compte pour recevoir vos virements.</div></div><button class="btn sm primary" id="setupStripeBtn" style="margin-left:auto">Configurer</button></div>';
      document.getElementById("setupStripeBtn")?.addEventListener("click", setupStripeAccount);
    } else {
      stripeAccountStatus.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:12px;border-radius:12px;border:1px solid rgba(34,197,94,.3);background:rgba(34,197,94,.08)"><span style="font-size:18px">&#x2705;</span><div><div style="font-weight:700;font-size:13px;color:#86efac">Compte de paiement configuré</div><div class="hint">Vous pouvez demander des virements.</div></div></div>';
    }
  }

  // List missions with payout actions
  if (payoutMissionsList) {
    if (availableMissions.length === 0 && waitingMissions.length === 0 && pendingMissions.length === 0) {
      payoutMissionsList.innerHTML = '<div class="hint">Aucune mission avec gains pour le moment.</div>';
      return;
    }

    var html = "";

    // Ready for payout (3 days passed)
    availableMissions.forEach(function(m) {
      var price = Number(m.negotiated_price || m.budget || 0);
      var net = Math.round((price - price * 0.02) * 100) / 100;
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:12px;border:1px solid rgba(34,197,94,.2);background:rgba(34,197,94,.05);font-size:13px">'
        + '<div><span style="font-weight:700">' + (m.title || "Mission") + '</span><br><span class="hint">' + net.toFixed(2) + ' € net (après 2% commission)</span></div>'
        + '<button class="btn sm success" onclick="requestPayout(\'' + m.id + '\')">Demander le virement</button>'
        + '</div>';
    });

    // Waiting for 3-day delay (confirmed but not yet available)
    waitingMissions.forEach(function(m) {
      var price = Number(m.negotiated_price || m.budget || 0);
      var net = Math.round((price - price * 0.02) * 100) / 100;
      var completedAt = m.completed_at ? new Date(m.completed_at).getTime() : now;
      var availableAt = completedAt + PAYOUT_DELAY_MS;
      var remainMs = availableAt - now;
      var remainDays = Math.ceil(remainMs / (24 * 60 * 60 * 1000));
      var remainLabel = remainDays > 1 ? remainDays + " jours" : remainDays === 1 ? "1 jour" : "Quelques heures";
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:12px;border:1px solid rgba(251,191,36,.2);background:rgba(251,191,36,.05);font-size:13px">'
        + '<div><span style="font-weight:700">' + (m.title || "Mission") + '</span><br><span class="hint">' + net.toFixed(2) + ' € net — Disponible dans ~' + remainLabel + '</span></div>'
        + '<span class="pill yellow">Confirmé &#x2705; En attente</span>'
        + '</div>';
    });

    // In progress / verification
    pendingMissions.forEach(function(m) {
      var price = Number(m.negotiated_price || m.budget || 0);
      var net = Math.round((price - price * 0.02) * 100) / 100;
      var statusLabel = m.status === "verification" ? "En vérification" : "En cours";
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);font-size:13px">'
        + '<div><span style="font-weight:700">' + (m.title || "Mission") + '</span><br><span class="hint">' + net.toFixed(2) + ' € net estimé</span></div>'
        + '<span class="pill yellow">' + statusLabel + '</span>'
        + '</div>';
    });

    // Already paid out
    var paidMissions = missions.filter(function(m) { return paidRequestIds.indexOf(m.id) !== -1; });
    paidMissions.forEach(function(m) {
      var payout = payouts.find(function(p) { return p.request_id === m.id; });
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.04);background:rgba(255,255,255,.02);font-size:13px;opacity:.7">'
        + '<div><span style="font-weight:700">' + (m.title || "Mission") + '</span><br><span class="hint">' + (payout ? payout.net_amount : "—") + ' € viré</span></div>'
        + '<span class="pill green">Viré &#x2705;</span>'
        + '</div>';
    });

    payoutMissionsList.innerHTML = html;
  }
}

async function setupStripeAccount() {
  var btn = document.getElementById("setupStripeBtn");
  if (btn) { btn.textContent = "Chargement..."; btn.disabled = true; }

  try {
    var { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = "connexion.html"; return; }

    var response = await fetch(SUPABASE_URL + "/functions/v1/connect-onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + session.access_token,
        "apikey": SUPABASE_ANON_KEY
      },
      body: JSON.stringify({})
    });

    var responseText = await response.text();
    var result = JSON.parse(responseText);

    if (result.url) {
      window.location.href = result.url;
    } else {
      alert("Erreur : " + (result.error || "Impossible de configurer le compte."));
      if (btn) { btn.textContent = "Configurer"; btn.disabled = false; }
    }
  } catch (err) {
    alert("Erreur de connexion : " + err.message);
    if (btn) { btn.textContent = "Configurer"; btn.disabled = false; }
  }
}

async function requestPayout(requestId) {
  var ok = window.confirm("Demander le virement pour cette mission ?\nLe montant sera transféré sur votre compte Stripe (délai 2-7 jours ouvrés).");
  if (!ok) return;

  try {
    var { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = "connexion.html"; return; }

    var response = await fetch(SUPABASE_URL + "/functions/v1/request-payout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + session.access_token,
        "apikey": SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ request_id: requestId })
    });

    var responseText = await response.text();
    var result = JSON.parse(responseText);

    if (result.success) {
      alert("Virement demandé ! " + result.net_amount + " € seront transférés sur votre compte (délai 2-7 jours).");
      await loadEarnings();
    } else {
      alert("Erreur : " + (result.error || "Impossible de demander le virement."));
    }
  } catch (err) {
    alert("Erreur de connexion : " + err.message);
  }
}
// Make requestPayout available globally for onclick
window.requestPayout = requestPayout;

function formatStatus(s) {
  var m = { nouveau: "Nouveau", en_attente: "En attente", negociation: "Négociation", en_attente_paiement: "En attente de paiement", en_cours: "En cours", verification: "Vérification", termine: "Terminé", annule: "Annulé" };
  return m[s] || s || "Nouveau";
}
function statusPillClass(s) {
  if (s === "en_cours") return "green";
  if (s === "negociation") return "yellow";
  if (s === "en_attente_paiement") return "yellow";
  if (s === "verification") return "yellow";
  if (s === "termine") return "green";
  if (s === "annule") return "red";
  return "";
}

async function loadMissions() {
  var result = await sb.from("requests")
    .select("id,title,status,created_at,negotiated_price,budget,category,skills,match_summary,deadline,deadline_at,delivered,client_user_id")
    .eq("assigned_indep_user_id", currentUserId).order("created_at", { ascending: false }).limit(20);
  var data = result.data;
  if (result.error || !data) { if (missionList) missionList.innerHTML = '<li class="hint">Erreur.</li>'; return; }
  if (data.length === 0) {
    if (missionList) missionList.innerHTML = '<li class="hint">Aucune mission.</li>';
    if (chatList) chatList.innerHTML = '<li class="hint">Aucune conversation.</li>';
    return;
  }
  if (missionList) missionList.innerHTML = data.map(function(r) {
    return '<li class="req-item" data-mission="' + r.id + '"><div><div class="title">' + r.title + '</div><div class="meta">' + (r.category || "") + ' · ' + (r.negotiated_price || r.budget || "?") + ' €</div></div><span class="pill ' + statusPillClass(r.status) + '">' + formatStatus(r.status) + '</span></li>';
  }).join("");
  if (chatList) chatList.innerHTML = data.map(function(r) {
    return '<li class="req-item" data-chat="' + r.id + '"><div class="title">' + r.title + '</div><span class="pill ' + statusPillClass(r.status) + '" style="font-size:10px">' + formatStatus(r.status) + '</span></li>';
  }).join("");

  document.querySelectorAll("[data-mission]").forEach(function(el) {
    el.addEventListener("click", function() { openMissionDetail(el.dataset.mission); });
  });
  document.querySelectorAll("[data-chat]").forEach(function(el) {
    el.addEventListener("click", function() { openConversation(el.dataset.chat); });
  });
}

// ---- AVAILABLE REQUESTS ----
async function loadAvailableRequests() {
  if (!availableRequests) return;
  try {
    var result = await sb.from("requests")
      .select("id,title,category,budget,skills,status,deadline,description,created_at")
      .is("assigned_indep_user_id", null)
      .in("status", ["en_attente", "nouveau"])
      .order("created_at", { ascending: false }).limit(15);
    var data = result.data;
    if (result.error || !data || data.length === 0) {
      availableRequests.innerHTML = '<li class="hint">Aucune demande disponible pour le moment.</li>';
      return;
    }
    var cat = categorySelect ? categorySelect.value : "";
    var filtered = cat ? data.filter(function(r) { return r.category && r.category.trim() === cat; }) : data;
    if (filtered.length === 0) {
      availableRequests.innerHTML = '<li class="hint">Aucune demande pour la catégorie "' + cat + '". <span style="color:var(--accent2);cursor:pointer" id="showAllBtn">Voir toutes</span></li>';
      var showAll = document.getElementById("showAllBtn");
      if (showAll) showAll.addEventListener("click", function() { renderAvailableList(data); });
      return;
    }
    renderAvailableList(filtered);
  } catch (err) {
    availableRequests.innerHTML = '<li class="hint">Erreur de chargement.</li>';
  }
}

function renderAvailableList(items) {
  if (!availableRequests) return;
  availableRequestMap = {};
  items.forEach(function(r) { availableRequestMap[String(r.id)] = r; });
  availableRequests.innerHTML = items.map(function(r) {
    var date = new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return '<li class="req-item" style="flex-wrap:wrap">' +
      '<div style="flex:1"><div class="title">' + r.title + '</div>' +
      '<div class="meta">' + (r.category || "") + ' · ' + (r.budget ? r.budget + ' €' : 'Budget à définir') + ' · ' + date + '</div>' +
      '<div class="meta">' + (r.skills || '') + '</div></div>' +
      '<button class="btn sm primary" data-apply="' + r.id + '" data-budget="' + (r.budget || "") + '">Postuler</button></li>';
  }).join("");
  document.querySelectorAll("[data-apply]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      openApplyModal(btn.dataset.apply, btn.dataset.budget, btn);
    });
  });
}

function openApplyModal(requestId, budget, btn) {
  var req = availableRequestMap[String(requestId)] || null;
  pendingApplyRequest = { requestId: requestId, budget: Number(budget || 0), btn: btn, request: req };
  if (applyPriceInput) applyPriceInput.value = pendingApplyRequest.budget > 0 ? String(pendingApplyRequest.budget) : "";
  if (applyMessageInput) applyMessageInput.value = req && req.skills ? ("Bonjour, je suis disponible pour cette mission. Je couvre : " + req.skills + ".") : "";
  if (applyMissionDetails) {
    var deadline = req && req.deadline ? req.deadline : "À définir";
    var budgetText = req && req.budget ? req.budget + " €" : "Budget à définir";
    applyMissionDetails.innerHTML =
      '<div class="detail-row"><span class="dl">Titre</span><span class="dd">' + (req && req.title ? req.title : "Mission") + '</span></div>' +
      '<div class="detail-row"><span class="dl">Catégorie</span><span class="dd">' + (req && req.category ? req.category : "—") + '</span></div>' +
      '<div class="detail-row"><span class="dl">Budget client</span><span class="dd">' + budgetText + '</span></div>' +
      '<div class="detail-row"><span class="dl">Deadline</span><span class="dd">' + deadline + '</span></div>' +
      '<div class="detail-row"><span class="dl">Compétences</span><span class="dd">' + (req && req.skills ? req.skills : "—") + '</span></div>' +
      '<div class="detail-row"><span class="dl">Description</span><span class="dd">' + (req && req.description ? req.description : "Non renseignée") + '</span></div>';
  }
  if (applyStatusText) applyStatusText.textContent = "";
  if (applyModal) applyModal.classList.add("show");
}

function closeApplyModal() {
  pendingApplyRequest = null;
  if (applyStatusText) applyStatusText.textContent = "";
  if (applyModal) applyModal.classList.remove("show");
}

if (cancelApplyBtn) cancelApplyBtn.addEventListener("click", closeApplyModal);
if (applyModal) {
  applyModal.addEventListener("click", function(e) {
    if (e.target === applyModal) closeApplyModal();
  });
}

if (confirmApplyBtn) {
  confirmApplyBtn.addEventListener("click", async function() {
    if (!pendingApplyRequest) return;
    var price = Number(applyPriceInput ? applyPriceInput.value : 0);
    var message = applyMessageInput ? applyMessageInput.value.trim() : "";
    await applyForRequest(pendingApplyRequest.requestId, pendingApplyRequest.btn, price, message);
  });
}

async function applyForRequest(requestId, btn, proposedPrice, customMessage) {
  if (!currentUserId) { alert("Session expirée. Merci de vous reconnecter."); return; }
  var sessionResult = await sb.auth.getSession();
  var user = sessionResult && sessionResult.data && sessionResult.data.session ? sessionResult.data.session.user : null;
  var profile = await ensureIndepProfile(user, true) || {
    firstname: user?.user_metadata?.firstname || "",
    lastname: user?.user_metadata?.lastname || "",
    skills: ""
  };
  if (!isFinite(proposedPrice) || proposedPrice <= 0) {
    alert("Merci de renseigner un prix valide (nombre supérieur à 0).");
    return;
  }
  if (!customMessage) {
    alert("Le message personnalisé est obligatoire.");
    return;
  }
  if (!btn) return;
  btn.textContent = "En cours...";
  btn.disabled = true;
  if (confirmApplyBtn) confirmApplyBtn.disabled = true;
  if (applyStatusText) applyStatusText.textContent = "Envoi de votre candidature...";
  try {
    var result = await sb.from("requests").update({
      assigned_indep_user_id: currentUserId,
      status: "negociation",
      match_summary: "Candidature de " + (profile.firstname || "") + " " + (profile.lastname || "") + (customMessage ? " — " + customMessage : ""),
      negotiated_price: proposedPrice
    }).eq("id", requestId).is("assigned_indep_user_id", null).select("id").maybeSingle();

    if (result.error || !result.data) {
      alert("Impossible de postuler. " + (result.error && result.error.message ? result.error.message : "Cette demande a peut-être déjà été prise."));
      if (applyStatusText) applyStatusText.textContent = "Échec : candidature non envoyée.";
      return;
    }

    await sb.from("request_messages").insert({
      request_id: requestId, sender_user_id: currentUserId,
      sender_role: "independant", channel: "fil", body: customMessage
    });

    await sb.from("request_messages").insert({
      request_id: requestId, sender_user_id: currentUserId,
      sender_role: "system", channel: "fil",
      body: (profile.firstname || "Indépendant") + " propose " + proposedPrice + " € pour cette mission."
    });

    alert("Candidature envoyée avec votre prix et votre message.");
    if (applyStatusText) applyStatusText.textContent = "Candidature envoyée ✅";
    closeApplyModal();
    await refreshAll();
  } catch (err) {
    alert("Erreur lors de la candidature : " + (err && err.message ? err.message : "inconnue"));
    if (applyStatusText) applyStatusText.textContent = "Erreur: " + (err && err.message ? err.message : "inconnue");
  } finally {
    btn.textContent = "Postuler";
    btn.disabled = false;
    if (confirmApplyBtn) confirmApplyBtn.disabled = false;
  }
}

// ---- MISSION DETAIL ----
async function openMissionDetail(requestId) {
  var result = await sb.from("requests")
    .select("id,title,status,negotiated_price,budget,category,skills,deadline,deadline_at,delivered,description,client_user_id")
    .eq("id", requestId).eq("assigned_indep_user_id", currentUserId).maybeSingle();
  var req = result.data;
  if (!req) return;
  currentRequest = req;
  if (missionDetailCard) missionDetailCard.style.display = "block";
  document.querySelectorAll("[data-mission]").forEach(function(el) {
    el.classList.toggle("active", String(el.dataset.mission) === String(requestId));
  });
  if (missionDetail) missionDetail.innerHTML =
    '<div class="detail-row"><span class="dl">Titre</span><span class="dd">' + req.title + '</span></div>' +
    '<div class="detail-row"><span class="dl">Catégorie</span><span class="dd">' + (req.category || "—") + '</span></div>' +
    '<div class="detail-row"><span class="dl">Budget initial</span><span class="dd">' + (req.budget || "—") + ' €</span></div>' +
    '<div class="detail-row"><span class="dl">Prix négocié</span><span class="dd">' + (req.negotiated_price || "—") + ' €</span></div>' +
    '<div class="detail-row"><span class="dl">Compétences</span><span class="dd">' + (req.skills || "—") + '</span></div>' +
    '<div class="detail-row"><span class="dl">Statut</span><span class="dd"><span class="pill ' + statusPillClass(req.status) + '">' + formatStatus(req.status) + '</span></span></div>' +
    '<div class="detail-row"><span class="dl">Livré</span><span class="dd">' + (req.delivered ? "Oui" : "Non") + '</span></div>';

  // Show deliver button only when mission is en_cours
  if (deliverBtn) {
    deliverBtn.style.display = req.status === "en_cours" ? "inline-flex" : "none";
  }

  updateDeadline(req);
  await loadDeliverables(requestId);
}

function updateDeadline(req) {
  if (deadlineInterval) clearInterval(deadlineInterval);
  var dl = req.deadline_at || req.deadline;
  if (!dl) { if (deadlineCountdown) deadlineCountdown.textContent = "Pas de deadline"; return; }
  var target = new Date(dl);
  if (isNaN(target.getTime())) { if (deadlineCountdown) deadlineCountdown.textContent = dl; return; }
  function tick() {
    var diff = target - Date.now();
    if (diff <= 0) { if (deadlineCountdown) { deadlineCountdown.textContent = "Deadline dépassée !"; deadlineCountdown.className = "countdown urgent"; } return; }
    var d = Math.floor(diff / 86400000);
    var h = Math.floor((diff % 86400000) / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    if (deadlineCountdown) {
      deadlineCountdown.textContent = d + "j " + h + "h " + m + "min restants";
      deadlineCountdown.className = diff < 86400000 ? "countdown urgent" : "countdown";
    }
  }
  tick();
  deadlineInterval = setInterval(tick, 60000);
}

// ---- FILES ----
if (fileZone) fileZone.addEventListener("click", function() { if (fileInput) fileInput.click(); });
if (fileInput) fileInput.addEventListener("change", handleFileUpload);

var MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 Mo

async function handleFileUpload() {
  if (!currentRequest || !fileInput.files.length) return;
  for (var i = 0; i < fileInput.files.length; i++) {
    var file = fileInput.files[i];
    if (file.size > MAX_FILE_SIZE) {
      alert(file.name + " dépasse la limite de 50 Mo.");
      continue;
    }
    // Upload to Supabase Storage
    var filePath = currentRequest.id + "/" + Date.now() + "_" + file.name;
    var uploadResult = await sb.storage.from("deliverables").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false
    });
    if (uploadResult.error) {
      alert("Erreur upload : " + uploadResult.error.message);
      continue;
    }
    // Get public URL
    var urlResult = sb.storage.from("deliverables").getPublicUrl(filePath);
    var publicUrl = urlResult.data ? urlResult.data.publicUrl : "";
    // Save to database
    await sb.from("deliverables").insert({
      request_id: currentRequest.id, indep_user_id: currentUserId,
      file_name: file.name, file_url: publicUrl, file_size: file.size
    });
  }
  fileInput.value = "";
  await loadDeliverables(currentRequest.id);
}

async function loadDeliverables(requestId) {
  var result = await sb.from("deliverables").select("id,file_name,file_size,file_url,uploaded_at")
    .eq("request_id", requestId).order("uploaded_at", { ascending: false });
  var data = result.data;
  if (!data || data.length === 0) { if (fileList) fileList.innerHTML = '<div class="hint">Aucun fichier.</div>'; return; }
  // Only show delete buttons if mission is not yet in verification/termine
  var canDelete = currentRequest && ["en_cours", "negociation"].indexOf(currentRequest.status) !== -1;
  if (fileList) fileList.innerHTML = data.map(function(f) {
    var size = f.file_size ? (f.file_size / 1024).toFixed(1) + " Ko" : "";
    var url = f.file_url && f.file_url.indexOf("simulated://") === -1 ? f.file_url : "";
    var downloadBtn = url ? '<a href="' + url + '" target="_blank" class="btn sm" style="font-size:11px">Télécharger</a>' : '';
    var deleteBtn = canDelete ? '<button class="btn sm danger" data-delete-file="' + f.id + '" style="font-size:11px">Supprimer</button>' : '';
    return '<div class="file-item"><span>' + f.file_name + '</span><div style="display:flex;align-items:center;gap:4px"><span class="hint">' + size + '</span>' + downloadBtn + deleteBtn + '</div></div>';
  }).join("");
  // Bind delete buttons
  document.querySelectorAll("[data-delete-file]").forEach(function(btn) {
    btn.addEventListener("click", async function() {
      var fileId = btn.dataset.deleteFile;
      var ok = window.confirm("Supprimer ce fichier ?");
      if (!ok) return;
      // Get file URL to extract storage path
      var fileData = data.find(function(f) { return String(f.id) === String(fileId); });
      if (fileData && fileData.file_url && fileData.file_url.indexOf("/deliverables/") !== -1) {
        var storagePath = fileData.file_url.split("/deliverables/").pop();
        if (storagePath) {
          await sb.storage.from("deliverables").remove([decodeURIComponent(storagePath)]);
        }
      }
      await sb.from("deliverables").delete().eq("id", fileId).eq("indep_user_id", currentUserId);
      await loadDeliverables(requestId);
    });
  });
}

// ---- DELIVER (mark as verification) ----
if (deliverBtn) {
  deliverBtn.addEventListener("click", async function() {
    if (!currentRequest) return;
    var ok = window.confirm("Marquer cette mission comme livrée ? Elle passera en vérification par un administrateur.");
    if (!ok) return;
    var result = await sb.from("requests").update({
      status: "verification",
      delivered: true,
      delivered_at: new Date().toISOString()
    }).eq("id", currentRequest.id).eq("assigned_indep_user_id", currentUserId);
    if (result.error) {
      alert("Impossible de marquer comme livré pour le moment.");
      return;
    }
    await sb.from("request_messages").insert({
      request_id: currentRequest.id, sender_user_id: currentUserId,
      sender_role: "system", channel: "fil",
      body: "L'indépendant a livré les fichiers. Mission en vérification par l'administrateur."
    }).catch(function(){});
    alert("Mission marquée comme livrée ! Un administrateur va vérifier.");
    await refreshAll();
    if (currentRequest) await openMissionDetail(currentRequest.id);
  });
}

// ---- CONVERSATION ----
async function openConversation(requestId) {
  var result = await sb.from("requests")
    .select("id,title,status,negotiated_price,budget,match_summary,assigned_indep_user_id,client_user_id,deadline")
    .eq("id", requestId).eq("assigned_indep_user_id", currentUserId).maybeSingle();
  var req = result.data;
  if (!req) return;
  currentRequest = req;
  document.querySelectorAll("[data-chat]").forEach(function(el) {
    el.classList.toggle("active", String(el.dataset.chat) === String(requestId));
  });
  if (chatTitle) chatTitle.textContent = req.title;
  if (chatStatusText) chatStatusText.textContent = formatStatus(req.status);
  if (chatInputArea) chatInputArea.style.display = "flex";

  // Nego bar visibility
  if (req.status === "negociation") {
    if (negoBar) negoBar.style.display = "block";
    if (priceInput) priceInput.value = req.negotiated_price || "";
    if (chatHint) chatHint.textContent = "Négociation — Proposez un prix ou acceptez celui du client.";
  } else {
    if (negoBar) negoBar.style.display = "none";
    if (chatHint) {
      if (req.status === "en_cours") chatHint.textContent = "Mission en cours.";
      else if (req.status === "verification") chatHint.textContent = "Mission en vérification par l'admin.";
      else if (req.status === "termine") chatHint.textContent = "Mission terminée.";
      else chatHint.textContent = "";
    }
  }

  // Header actions
  var actionsHtml = "";
  // Cancel before en_cours
  if (["negociation"].indexOf(req.status) !== -1) {
    actionsHtml += '<button class="btn sm danger" id="cancelMissionIndepBtn">Annuler</button>';
    actionsHtml += '<button class="btn sm primary" id="acceptPriceIndepBtn" style="display:none">Accepter le prix (' + (req.negotiated_price || req.budget || "?") + ' \u20ac)</button>';
  }
  if (["termine"].indexOf(req.status) !== -1) {
    actionsHtml += '<button class="btn sm" id="rateClientBtn" style="display:none">Noter le client</button>';
  }
  if (chatHeaderActions) chatHeaderActions.innerHTML = actionsHtml;

  // Check who proposed last price - indep can only accept if client proposed last
  if (["negociation"].indexOf(req.status) !== -1) {
    var priceResult = await sb.from("request_messages")
      .select("body").eq("request_id", req.id).eq("sender_role", "system")
      .like("body", "%prix propos%")
      .order("created_at", { ascending: false }).limit(1);
    var lastMsg = priceResult.data && priceResult.data[0] ? priceResult.data[0].body : "";
    var acceptBtn = document.getElementById("acceptPriceIndepBtn");
    if (acceptBtn) {
      // Indep can accept only if client proposed the last price
      var lastIsClient = lastMsg.indexOf("client") !== -1;
      acceptBtn.style.display = lastIsClient ? "inline-flex" : "none";
    }
  }

  // Bind actions
  var cancelBtn = document.getElementById("cancelMissionIndepBtn");
  if (cancelBtn) cancelBtn.addEventListener("click", async function() {
    var ok = window.confirm("Annuler cette mission ?");
    if (!ok) return;
    await sb.from("requests").update({
      status: "en_attente", assigned_indep_user_id: null, negotiated_price: null,
      match_summary: "L'indépendant s'est désisté. Mission remise en attente."
    }).eq("id", req.id);
    await sb.from("request_messages").insert({
      request_id: req.id, sender_user_id: currentUserId, sender_role: "system", channel: "fil",
      body: "L'indépendant s'est désisté. Mission remise en attente."
    }).catch(function(){});
    await refreshAll();
  });

  var acceptPriceBtn = document.getElementById("acceptPriceIndepBtn");
  if (acceptPriceBtn) acceptPriceBtn.addEventListener("click", async function() {
    var price = req.negotiated_price || req.budget || 0;
    var ok = window.confirm("Accepter le prix de " + price + " \u20ac ? Le client devra effectuer le paiement pour lancer la mission.");
    if (!ok) return;
    var upResult = await sb.from("requests").update({ status: "en_attente_paiement" }).eq("id", req.id);
    if (upResult.error) { alert("Erreur. R\u00e9essayez."); return; }
    await sb.from("request_messages").insert({
      request_id: req.id, sender_user_id: currentUserId, sender_role: "system", channel: "fil",
      body: "L'ind\u00e9pendant a accept\u00e9 le prix de " + price + " \u20ac. En attente du paiement client."
    }).catch(function(){});
    await refreshAll();
    await openConversation(req.id);
  });

  var rateBtn = document.getElementById("rateClientBtn");
  if (rateBtn) rateBtn.addEventListener("click", openRatingModal);
  // Check if already rated
  if (["termine"].indexOf(req.status) !== -1 && rateBtn) {
    var ratingCheck = await sb.from("ratings")
      .select("id").eq("request_id", req.id).eq("rater_user_id", currentUserId).maybeSingle();
    if (ratingCheck.data) {
      rateBtn.textContent = "Déjà noté";
      rateBtn.disabled = true;
    }
    rateBtn.style.display = "inline-flex";
  }

  await loadMessages();
  subscribeMessages(requestId);
}

async function loadMessages() {
  if (!currentRequest) return;
  var result = await sb.from("request_messages")
    .select("sender_role,body,created_at").eq("request_id", currentRequest.id)
    .order("created_at", { ascending: true });
  var msgs = result.data;
  if (!msgs || msgs.length === 0) {
    if (chatMessages) chatMessages.innerHTML = '<div class="hint" style="text-align:center;margin:auto">Aucun message.</div>';
    return;
  }
  if (chatMessages) chatMessages.innerHTML = msgs.map(function(m) {
    var time = new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return '<div class="msg ' + m.sender_role + '"><div>' + m.body + '</div><div class="time">' + time + '</div></div>';
  }).join("");
  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Send
if (sendBtn) sendBtn.addEventListener("click", sendMessage);
if (msgInput) msgInput.addEventListener("keydown", function(e) { if (e.key === "Enter") sendMessage(); });

async function sendMessage() {
  if (!currentRequest || !msgInput || !msgInput.value.trim()) return;
  await sb.from("request_messages").insert({
    request_id: currentRequest.id, sender_user_id: currentUserId,
    sender_role: "independant", channel: "fil", body: msgInput.value.trim()
  });
  msgInput.value = "";
  await loadMessages();
}

// Price proposal (indep)
if (proposePriceBtn) {
  proposePriceBtn.addEventListener("click", async function() {
    if (!currentRequest || !priceInput || !priceInput.value) return;
    var price = Number(priceInput.value);
    if (!price || price <= 0) { alert("Entrez un prix valide."); return; }
    await sb.from("requests").update({ negotiated_price: price }).eq("id", currentRequest.id);
    await sb.from("request_messages").insert({
      request_id: currentRequest.id, sender_user_id: currentUserId, sender_role: "system", channel: "fil",
      body: "Nouveau prix proposé par l'indépendant : " + price + " €"
    });
    await loadMessages();
    await openConversation(currentRequest.id);
  });
}

// ---- REALTIME ----
function setupRealtime() {
  sb.channel("indep-requests-" + currentUserId)
    .on("postgres_changes", { event: "*", schema: "public", table: "requests", filter: "assigned_indep_user_id=eq." + currentUserId }, function() { refreshAll(); })
    .subscribe();
  sb.channel("indep-notifs-" + currentUserId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "recipient_user_id=eq." + currentUserId }, function(payload) { if (isOnline) showNotification(payload.new); })
    .subscribe();
}

function subscribeMessages(requestId) {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel("indep-chat-" + requestId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "request_messages", filter: "request_id=eq." + requestId }, function() { loadMessages(); })
    .subscribe();
}

// ---- NOTIFICATIONS ----
async function checkPendingNotifications() {
  var result = await sb.from("notifications")
    .select("*").eq("recipient_user_id", currentUserId).eq("seen", false)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1);
  if (result.data && result.data.length > 0) showNotification(result.data[0]);
}

function showNotification(notif) {
  if (!notif || notif.type !== "new_request") return;
  var expiresAt = new Date(notif.expires_at);
  if (expiresAt <= new Date()) return;
  if (notifDetails) notifDetails.innerHTML = '<div><strong>' + (notif.title || "Nouvelle mission") + '</strong></div><div>' + (notif.body || "") + '</div>';
  if (notifPopup) notifPopup.classList.add("show");
  if (notifInterval) clearInterval(notifInterval);
  if (notifTimer) clearTimeout(notifTimer);
  var totalMs = expiresAt - Date.now();
  notifInterval = setInterval(function() {
    var remaining = Math.max(0, expiresAt - Date.now());
    var pct = (remaining / totalMs) * 100;
    if (notifTimerBar) notifTimerBar.style.width = pct + "%";
    if (notifCountdownEl) notifCountdownEl.textContent = "Expire dans " + Math.ceil(remaining / 1000) + "s";
    if (remaining <= 0) { clearInterval(notifInterval); hideNotification(); }
  }, 500);
  notifTimer = setTimeout(function() { hideNotification(); }, totalMs);

  if (notifAccept) notifAccept.onclick = async function() {
    await sb.from("notifications").update({ seen: true }).eq("id", notif.id);
    hideNotification();
    await refreshAll();
    if (notif.request_id) openConversation(notif.request_id);
  };
  if (notifDecline) notifDecline.onclick = async function() {
    await sb.from("notifications").update({ seen: true }).eq("id", notif.id);
    if (notif.request_id) {
      await sb.from("requests").update({ assigned_indep_user_id: null, status: "en_attente", match_summary: "Indépendant a refusé. En attente." }).eq("id", notif.request_id);
    }
    hideNotification();
  };
}

function hideNotification() {
  if (notifPopup) notifPopup.classList.remove("show");
  if (notifInterval) clearInterval(notifInterval);
  if (notifTimer) clearTimeout(notifTimer);
}

// ---- RATING ----
function initRatingStars() {
  if (!ratingStarsEl) return;
  ratingStarsEl.innerHTML = "";
  for (var i = 1; i <= 10; i++) {
    (function(idx) {
      var star = document.createElement("div");
      star.className = "star";
      star.textContent = idx;
      star.addEventListener("click", function() {
        selectedRating = idx;
        ratingStarsEl.querySelectorAll(".star").forEach(function(s, j) { s.classList.toggle("active", j < idx); });
      });
      ratingStarsEl.appendChild(star);
    })(i);
  }
}
initRatingStars();

function openRatingModal() {
  selectedRating = 0;
  if (ratingComment) ratingComment.value = "";
  if (ratingStarsEl) ratingStarsEl.querySelectorAll(".star").forEach(function(s) { s.classList.remove("active"); });
  if (ratingModal) ratingModal.classList.add("show");
}

if (skipRatingBtn) skipRatingBtn.addEventListener("click", function() { if (ratingModal) ratingModal.classList.remove("show"); });
if (submitRatingBtn) {
  submitRatingBtn.addEventListener("click", async function() {
    if (!currentRequest || selectedRating === 0) { alert("Choisissez une note."); return; }
    var ratingResult = await sb.from("ratings").insert({
      request_id: currentRequest.id, rater_user_id: currentUserId,
      rated_user_id: currentRequest.client_user_id, rater_role: "independant",
      score: selectedRating, comment: (ratingComment ? ratingComment.value.trim() : null) || null
    });
    if (ratingResult.error) {
      if (ratingResult.error.message && ratingResult.error.message.indexOf("unique") !== -1) {
        alert("Vous avez déjà noté cette mission.");
      } else {
        alert("Erreur lors de l'envoi de la note.");
      }
      if (ratingModal) ratingModal.classList.remove("show");
      return;
    }
    if (ratingModal) ratingModal.classList.remove("show");
    alert("Merci pour votre évaluation !");
    // Check if both parties have rated -> close mission
    var allRatings = await sb.from("ratings").select("rater_role").eq("request_id", currentRequest.id);
    var roles = (allRatings.data || []).map(function(r) { return r.rater_role; });
    if (roles.indexOf("client") !== -1 && roles.indexOf("independant") !== -1) {
      await sb.from("requests").update({ status: "termine" }).eq("id", currentRequest.id);
    }
    await loadUserRating();
    await refreshAll();
    if (currentRequest) await openConversation(currentRequest.id);
  });
}
