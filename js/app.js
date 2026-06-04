// ============================================================
//  NÚCLEO  ·  Cliente Supabase, autenticación, sesión y rutas
//  (define los helpers globales que usan admin.js y tienda.js)
// ============================================================

let sb = null;             // cliente de Supabase
let db = null;             // alias para consultas (sb.from / sb.rpc)
let usuarioActual = null;  // auth.user
let perfilActual  = null;  // { nombre, rol, email }

const credsOk =
  SUPABASE_URL && SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("TU-PROYECTO") &&
  !SUPABASE_ANON_KEY.includes("TU_ANON_KEY");

// ---------- Helpers compartidos ----------
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const money = (v) =>
  "$" + Number(v || 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fechaCorta = (iso) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

let toastTimer;
function toast(msg, tipo = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast " + tipo;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3400);
}

function abrirModal(titulo, html) {
  $("#modal-titulo").textContent = titulo;
  $("#modal-body").innerHTML = html;
  $("#modal").hidden = false;
}
function cerrarModal() { $("#modal").hidden = true; }

// Confirmación con modal (reemplaza window.confirm). Devuelve Promise<boolean>.
function confirmar(mensaje, textoOk = "Aceptar") {
  return new Promise((resolve) => {
    abrirModal("Confirmar", `
      <p style="line-height:1.6">${mensaje}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button id="confirm-cancel" class="btn">Cancelar</button>
        <button id="confirm-ok" class="btn primario">${textoOk}</button>
      </div>`);
    document.getElementById("confirm-ok").addEventListener("click", () => { cerrarModal(); resolve(true); });
    document.getElementById("confirm-cancel").addEventListener("click", () => { cerrarModal(); resolve(false); });
  });
}

// ---------- Navegación por pestañas (delegada, sirve para admin y tienda) ----------
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  const vista = btn.closest("main");
  if (!vista) return;
  vista.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("activo"));
  vista.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("activo"));
  btn.classList.add("activo");
  const panel = document.getElementById("tab-" + btn.dataset.tab);
  if (panel) panel.classList.add("activo");
});

$("#modal-cerrar").addEventListener("click", cerrarModal);

// ---------- Mostrar una de las 3 vistas ----------
function mostrarVista(cual) {
  $("#vista-auth").hidden   = cual !== "auth";
  $("#vista-admin").hidden  = cual !== "admin";
  $("#vista-tienda").hidden = cual !== "tienda";
  $("#topbar").hidden       = cual === "auth";
}

// ============================================================
//  AUTENTICACIÓN
// ============================================================
let modoAuth = "login";

$$(".auth-tab").forEach((t) =>
  t.addEventListener("click", () => {
    modoAuth = t.dataset.modo;
    $$(".auth-tab").forEach((x) => x.classList.remove("activo"));
    t.classList.add("activo");
    $("#campo-nombre").hidden = modoAuth === "login";
    $("#auth-nombre").required = modoAuth === "registro";
    $("#btn-auth").textContent = modoAuth === "login" ? "Entrar" : "Crear cuenta";
    $("#auth-msg").textContent = "";
  })
);

function traducirError(m) {
  if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
  if (/already registered|already been registered/i.test(m)) return "Ese correo ya está registrado.";
  if (/Email not confirmed/i.test(m)) return "Debes confirmar tu correo (o desactiva la confirmación en Supabase).";
  if (/Password should be|at least 6/i.test(m)) return "La contraseña debe tener al menos 6 caracteres.";
  if (/schema|relation|does not exist|table/i.test(m)) return "Faltan las tablas: ejecuta supabase_schema.sql en Supabase.";
  return m;
}

$("#form-auth").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  const nombre = $("#auth-nombre").value.trim();
  const msg = $("#auth-msg");
  msg.textContent = "";
  $("#btn-auth").disabled = true;
  try {
    if (modoAuth === "registro" && !nombre) throw new Error("El nombre es obligatorio.");
    if (modoAuth === "registro") {
      const { data, error } = await sb.auth.signUp({
        email, password, options: { data: { nombre } },
      });
      if (error) throw error;
      if (!data.session) {
        msg.className = "auth-msg ok";
        msg.textContent = "✅ Cuenta creada. Si te pide confirmar el correo, revísalo; luego inicia sesión.";
      }
      // Si hay sesión, onAuthStateChange enruta automáticamente.
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    msg.className = "auth-msg error";
    msg.textContent = traducirError(err.message || String(err));
  } finally {
    $("#btn-auth").disabled = false;
  }
});

$("#btn-logout").addEventListener("click", async () => {
  await sb.auth.signOut();
});

// ============================================================
//  SESIÓN  ->  carga el perfil (rol) y muestra la vista correcta
// ============================================================
async function cargarPerfilYEnrutar(session) {
  const uid = session?.user?.id || null;
  if (uid && uid === usuarioActual?.id) return; // sin cambios (p.ej. refresh de token)

  if (!session) {
    usuarioActual = null;
    perfilActual = null;
    mostrarVista("auth");
    return;
  }

  usuarioActual = session.user;

  let perfil = null;
  const { data, error } = await db
    .from("perfiles")
    .select("nombre, rol, email")
    .eq("id", usuarioActual.id)
    .maybeSingle();
  if (error) toast(traducirError(error.message), "error");
  perfil = data;

  if (!perfil) {
    perfil = { nombre: usuarioActual.email.split("@")[0], rol: "cliente", email: usuarioActual.email };
  }
  perfilActual = perfil;

  $("#user-info").textContent = perfil.nombre || perfil.email;
  $("#rol-badge").textContent = perfil.rol;

  if (perfil.rol === "admin") {
    mostrarVista("admin");
    initAdmin();
  } else {
    mostrarVista("tienda");
    initTienda();
  }
}

// ============================================================
//  ARRANQUE
// ============================================================
async function init() {
  if (!credsOk) {
    mostrarVista("auth");
    $("#auth-msg").className = "auth-msg error";
    $("#auth-msg").textContent = "⚙️ Configura tus credenciales en js/config.js";
    $("#form-auth").querySelectorAll("input, button").forEach((el) => (el.disabled = true));
    return;
  }

  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  db = sb;

  // onAuthStateChange emite el estado inicial y reacciona a login/logout.
  // Se difiere con setTimeout para no bloquear el lock interno de la librería.
  sb.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => cargarPerfilYEnrutar(session), 0);
  });
}

init();
