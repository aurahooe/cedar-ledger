const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const authBtn = $("authBtn");
const modal = $("modal");
const authForm = $("authForm");
const toggleMode = $("toggleMode");
const authMsg = $("authMsg");
const slipForm = $("slipForm");
const deskHint = $("deskHint");

let mode = "signin";
let user = null;

function hourKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

function remaining() {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(60, 0, 0);
  const ms = next - now;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { m, s, pct: 1 - ms / 3600000 };
}

function tick() {
  const r = remaining();
  $("tick").textContent = `${r.m}m ${String(r.s).padStart(2, "0")}s left in this hour`;
  $("meterFill").style.width = `${Math.max(4, r.pct * 100)}%`;
}

async function loadHour() {
  const key = hourKey();
  const { data } = await sb.from("cedar_hours").select("*").eq("hour_key", key).maybeSingle();
  if (data) {
    $("headline").textContent = data.headline;
    $("blurb").textContent = data.blurb;
    $("hourLabel").textContent = `Edition ${key.replace("T", " · ")} UTC`;
  } else {
    $("hourLabel").textContent = `Hour ${key.replace("T", " · ")} UTC`;
  }
}

function cardHTML(row, i) {
  const tilt = ((i % 5) - 2) * 0.6;
  const when = new Date(row.created_at).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
  return `<article class="card" style="--tilt:${tilt}deg">
    <h3>${escapeHtml(row.title)}</h3>
    <p>${escapeHtml(row.body)}</p>
    <div class="meta">${when}</div>
  </article>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;"
  }[c]));
}

async function loadWall() {
  const { data, error } = await sb
    .from("cedar_slips")
    .select("*")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) {
    $("wallList").innerHTML = `<p class="fine">${escapeHtml(error.message)}</p>`;
    return;
  }
  if (!data || !data.length) {
    $("wallList").innerHTML = `<p class="fine">Nothing pinned yet. The wall is waiting.</p>`;
    return;
  }
  $("wallList").innerHTML = data.map(cardHTML).join("");
}

async function loadMine() {
  if (!user) {
    $("myList").innerHTML = "";
    return;
  }
  const { data } = await sb
    .from("cedar_slips")
    .select("*")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });
  $("myList").innerHTML = (data || []).map((row, i) => {
    const tilt = ((i % 5) - 2) * 0.4;
    return `<article class="slip" style="--tilt:${tilt}deg" data-id="${row.id}">
      <h3>${escapeHtml(row.title)}</h3>
      <p>${escapeHtml(row.body)}</p>
      <div class="meta">${row.is_public ? "On the wall" : "In the drawer"}</div>
      <div class="actions">
        <button data-act="toggle">${row.is_public ? "Make private" : "Pin public"}</button>
        <button data-act="delete">Delete</button>
      </div>
    </article>`;
  }).join("");
}

async function ensureProfile() {
  if (!user) return;
  const { data } = await sb.from("cedar_profiles").select("id").eq("id", user.id).maybeSingle();
  if (data) return;
  const handle = (user.email || "reader").split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 24) || "reader";
  await sb.from("cedar_profiles").insert({
    id: user.id,
    handle: handle + Math.floor(Math.random() * 90 + 10),
    display_name: handle
  });
}

function setSession(session) {
  user = session?.user || null;
  authBtn.textContent = user ? "Sign out" : "Sign in";
  slipForm.hidden = !user;
  deskHint.textContent = user
    ? `Signed in as ${user.email}. Private slips stay in your drawer.`
    : "Sign in to keep a drawer. Public slips appear on the wall immediately.";
  loadMine();
}

authBtn.addEventListener("click", async () => {
  if (user) {
    await sb.auth.signOut();
    return;
  }
  modal.hidden = false;
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.hidden = true;
});

toggleMode.addEventListener("click", () => {
  mode = mode === "signin" ? "signup" : "signin";
  $("modalTitle").textContent = mode === "signin" ? "Sign in" : "Create an account";
  toggleMode.textContent = mode === "signin" ? "Need an account?" : "Have an account?";
  authForm.querySelector("[data-mode]").textContent = mode === "signin" ? "Enter" : "Create";
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(authForm);
  const email = String(fd.get("email"));
  const password = String(fd.get("password"));
  authMsg.textContent = "Working…";
  const fn = mode === "signin" ? sb.auth.signInWithPassword : sb.auth.signUp;
  const { error } = await fn.call(sb.auth, { email, password });
  if (error) {
    authMsg.textContent = error.message;
    return;
  }
  authMsg.textContent = mode === "signup" ? "Account ready. You can write now." : "";
  modal.hidden = true;
});

slipForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!user) return;
  const fd = new FormData(slipForm);
  const payload = {
    author_id: user.id,
    title: String(fd.get("title")).trim(),
    body: String(fd.get("body")).trim(),
    is_public: fd.get("is_public") === "on"
  };
  const { error } = await sb.from("cedar_slips").insert(payload);
  if (error) {
    alert(error.message);
    return;
  }
  slipForm.reset();
  loadWall();
  loadMine();
});

$("myList").addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  const card = e.target.closest("[data-id]");
  if (!btn || !card) return;
  const id = card.dataset.id;
  if (btn.dataset.act === "delete") {
    await sb.from("cedar_slips").delete().eq("id", id);
  }
  if (btn.dataset.act === "toggle") {
    const makingPublic = btn.textContent.includes("Pin");
    await sb.from("cedar_slips").update({ is_public: makingPublic, updated_at: new Date().toISOString() }).eq("id", id);
  }
  loadWall();
  loadMine();
});

sb.auth.onAuthStateChange((_e, session) => {
  setSession(session);
  if (session?.user) ensureProfile();
});

loadHour();
loadWall();
tick();
setInterval(tick, 1000);
setInterval(loadHour, 60_000);
setInterval(loadWall, 60_000);
