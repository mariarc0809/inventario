// ============================================================
//  PANEL ADMIN  ·  Productos, categorías, movimientos y ventas
//  Expone:  window.initAdmin()
// ============================================================
(function () {
  let categorias = [];
  let productos  = [];
  let imagenProducto = null;   // imagen (base64) del producto en edición/alta
  let montado = false;

  // ---------- Arranque ----------
  async function initAdmin() {
    if (!montado) { montarListeners(); montado = true; }
    cargarCategorias();
    await cargarProductos();
    cargarMovimientos();
    cargarVentas();
    mostrarAlertaStockBajo();   // modal de stock bajo, solo al iniciar sesión
  }
  window.initAdmin = initAdmin;

  // ---- Modales de formulario (Agregar / Crear / Registrar) ----
  function abrirFormModal(tipo) {
    const m = document.getElementById("form-modal-" + tipo);
    if (m) m.hidden = false;
  }
  function cerrarFormModal(tipo) {
    const m = document.getElementById("form-modal-" + tipo);
    if (m) m.hidden = true;
    if (tipo === "producto") resetFormProducto();
    if (tipo === "categoria") resetFormCategoria();
    if (tipo === "movimiento") { $("#form-movimiento").reset(); $("#movimiento-cantidad").value = 1; }
  }

  function montarListeners() {
    // Botones "+ Agregar" y los de cerrar de cada modal de formulario
    document.querySelectorAll("[data-abrir]").forEach((b) =>
      b.addEventListener("click", () => {
        const tipo = b.dataset.abrir;
        if (tipo === "producto") resetFormProducto();
        if (tipo === "categoria") resetFormCategoria();
        if (tipo === "movimiento") { $("#form-movimiento").reset(); $("#movimiento-cantidad").value = 1; }
        abrirFormModal(tipo);
      }));
    document.querySelectorAll("[data-cerrar]").forEach((b) =>
      b.addEventListener("click", () => cerrarFormModal(b.dataset.cerrar)));

    $("#form-categoria").addEventListener("submit", guardarCategoria);
    $("#categorias-body").addEventListener("click", onAccionCategoria);

    $("#form-producto").addEventListener("submit", guardarProducto);
    $("#producto-imagen").addEventListener("change", onSeleccionImagen);
    $("#productos-body").addEventListener("click", onAccionProducto);

    let buscarTimer;
    $("#buscar-producto").addEventListener("input", () => {
      clearTimeout(buscarTimer);
      buscarTimer = setTimeout(cargarProductos, 250);
    });

    $("#form-movimiento").addEventListener("submit", registrarMovimiento);

    $("#btn-refrescar-ventas").addEventListener("click", cargarVentas);
    $("#ventas-admin-body").addEventListener("click", onAccionVenta);
    $("#ventas-admin-body").addEventListener("change", onCambioEstado);
  }

  // ========================================================
  //  CATEGORÍAS
  // ========================================================
  async function cargarCategorias() {
    const { data, error } = await db.from("categorias").select("*, productos(count)").order("nombre");
    if (error) return toast("Error al cargar categorías: " + error.message, "error");
    categorias = data || [];
    renderCategorias();
    llenarSelectCategoria();
  }

  function renderCategorias() {
    const body = $("#categorias-body");
    if (!categorias.length) { body.innerHTML = '<tr><td colspan="5" class="vacio">Sin categorías.</td></tr>'; return; }
    body.innerHTML = categorias.map((c) => `
      <tr>
        <td>${c.id}</td>
        <td>${esc(c.nombre)}</td>
        <td>${esc(c.descripcion || "")}</td>
        <td class="num">${c.productos?.[0]?.count ?? 0}</td>
        <td>
          <button class="btn-mini" data-accion="editar" data-id="${c.id}" title="Editar">✏️</button>
          <button class="btn-mini borrar" data-accion="borrar" data-id="${c.id}" title="Eliminar">🗑️</button>
        </td>
      </tr>`).join("");
  }

  function llenarSelectCategoria() {
    const sel = $("#producto-categoria");
    const actual = sel.value;
    sel.innerHTML = '<option value="" disabled selected>— Selecciona —</option>' +
      categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("");
    sel.value = actual;
  }

  async function guardarCategoria(e) {
    e.preventDefault();
    const id = $("#categoria-id").value;
    const payload = {
      nombre: $("#categoria-nombre").value.trim(),
      descripcion: $("#categoria-descripcion").value.trim() || null,
    };
    if (!payload.nombre) return;
    const { error } = id
      ? await db.from("categorias").update(payload).eq("id", id)
      : await db.from("categorias").insert(payload);
    if (error) return toast("Error: " + error.message, "error");
    toast(id ? "Categoría actualizada" : "Categoría creada");
    cerrarFormModal("categoria");
    await cargarCategorias();
    await cargarProductos();
  }

  function onAccionCategoria(e) {
    const btn = e.target.closest("button[data-accion]");
    if (!btn) return;
    if (btn.dataset.accion === "editar") editarCategoria(btn.dataset.id);
    if (btn.dataset.accion === "borrar") eliminarCategoria(btn.dataset.id);
  }

  function editarCategoria(id) {
    const c = categorias.find((x) => String(x.id) === String(id));
    if (!c) return;
    $("#categoria-id").value = c.id;
    $("#categoria-nombre").value = c.nombre;
    $("#categoria-descripcion").value = c.descripcion || "";
    $("#titulo-form-categoria").textContent = "Editar categoría";
    abrirFormModal("categoria");
    $("#categoria-nombre").focus();
  }

  async function eliminarCategoria(id) {
    const c = categorias.find((x) => String(x.id) === String(id));
    const ok = await confirmar(
      `¿Eliminar la categoría "${esc(c?.nombre)}"? Los productos quedarán sin categoría.`, "Sí, eliminar");
    if (!ok) return;
    const { error } = await db.from("categorias").delete().eq("id", id);
    if (error) return toast("Error: " + error.message, "error");
    toast("Categoría eliminada");
    await cargarCategorias();
    await cargarProductos();
  }

  function resetFormCategoria() {
    $("#form-categoria").reset();
    $("#categoria-id").value = "";
    $("#titulo-form-categoria").textContent = "Crear categoría";
  }

  // ========================================================
  //  PRODUCTOS
  // ========================================================
  async function cargarProductos() {
    const filtro = $("#buscar-producto").value.trim();
    let q = db.from("productos").select("*, categorias(nombre)").order("nombre");
    if (filtro) q = q.ilike("nombre", `%${filtro}%`);
    const { data, error } = await q;
    if (error) return toast("Error al cargar productos: " + error.message, "error");
    productos = data || [];
    renderProductos();
    llenarSelectMovimientos();
  }

  function renderProductos() {
    const body = $("#productos-body");
    if (!productos.length) { body.innerHTML = '<tr><td colspan="9" class="vacio">Sin productos.</td></tr>'; return; }
    body.innerHTML = productos.map((p) => {
      let estado;
      if (p.stock === 0) estado = '<span class="pill cero">Sin stock</span>';
      else if (p.stock <= p.stock_minimo) estado = '<span class="pill bajo">Bajo</span>';
      else estado = '<span class="pill ok">OK</span>';
      const cat = p.categorias?.nombre ? `<span class="tag">${esc(p.categorias.nombre)}</span>` : "—";
      const tienda = p.activo ? "✅" : "—";
      const mini = p.imagen ? `<img class="mini-img" src="${p.imagen}" alt="">` : "";
      return `<tr>
        <td>${p.id}</td>
        <td><span class="td-prod">${mini}${esc(p.nombre)}</span></td>
        <td>${cat}</td>
        <td class="num">${money(p.precio)}</td>
        <td class="num">${p.stock}</td>
        <td class="num">${p.stock_minimo}</td>
        <td>${estado}</td>
        <td>${tienda}</td>
        <td>
          <button class="btn-mini" data-accion="editar" data-id="${p.id}" title="Editar">✏️</button>
          <button class="btn-mini borrar" data-accion="borrar" data-id="${p.id}" title="Eliminar">🗑️</button>
        </td>
      </tr>`;
    }).join("");
  }

  // ---- Imagen del producto (se toma del PC y se reduce a base64) ----
  function comprimirImagen(file, maxLado = 500, calidad = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxLado) { height = Math.round(height * maxLado / width); width = maxLado; }
          else if (height > maxLado) { width = Math.round(width * maxLado / height); height = maxLado; }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", calidad));
        };
        img.onerror = reject;
        img.src = ev.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onSeleccionImagen(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      imagenProducto = await comprimirImagen(file);
      const prev = $("#producto-imagen-preview");
      prev.src = imagenProducto;
      prev.hidden = false;
    } catch (_) {
      toast("No se pudo leer la imagen", "error");
    }
  }

  async function guardarProducto(e) {
    e.preventDefault();
    const id = $("#producto-id").value;
    const payload = {
      nombre: $("#producto-nombre").value.trim(),
      descripcion: $("#producto-descripcion").value.trim() || null,
      precio: parseFloat($("#producto-precio").value) || 0,
      stock_minimo: parseInt($("#producto-stock-minimo").value, 10) || 0,
      activo: $("#producto-activo").checked,
      imagen: imagenProducto,
      categoria_id: $("#producto-categoria").value || null,
    };
    if (!payload.nombre) return;

    let error;
    if (id) {
      ({ error } = await db.from("productos").update(payload).eq("id", id));
    } else {
      payload.stock = parseInt($("#producto-stock").value, 10) || 0;
      ({ error } = await db.from("productos").insert(payload));
    }
    if (error) return toast("Error: " + error.message, "error");
    toast(id ? "Producto actualizado" : "Producto agregado");
    cerrarFormModal("producto");
    await cargarProductos();
  }

  function onAccionProducto(e) {
    const btn = e.target.closest("button[data-accion]");
    if (!btn) return;
    if (btn.dataset.accion === "editar") editarProducto(btn.dataset.id);
    if (btn.dataset.accion === "borrar") eliminarProducto(btn.dataset.id);
  }

  function editarProducto(id) {
    const p = productos.find((x) => String(x.id) === String(id));
    if (!p) return;
    $("#producto-id").value = p.id;
    $("#producto-nombre").value = p.nombre;
    $("#producto-descripcion").value = p.descripcion || "";
    $("#producto-precio").value = p.precio;
    $("#producto-stock").value = p.stock;
    $("#producto-stock-minimo").value = p.stock_minimo;
    $("#producto-activo").checked = p.activo;
    $("#producto-categoria").value = p.categoria_id || "";
    imagenProducto = p.imagen || null;
    $("#producto-imagen").required = false;
    const prevImg = $("#producto-imagen-preview");
    if (p.imagen) { prevImg.src = p.imagen; prevImg.hidden = false; }
    else { prevImg.hidden = true; prevImg.removeAttribute("src"); }
    $("#producto-stock").disabled = true;
    $("#nota-stock").hidden = false;
    $("#titulo-form-producto").textContent = "Editar producto";
    abrirFormModal("producto");
    $("#producto-nombre").focus();
  }

  async function eliminarProducto(id) {
    const p = productos.find((x) => String(x.id) === String(id));
    const ok = await confirmar(
      `¿Eliminar el producto "${esc(p?.nombre)}"? También se borrarán sus movimientos.`, "Sí, eliminar");
    if (!ok) return;
    const { error } = await db.from("productos").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        // El producto tiene ventas: no se puede borrar (rompería el historial)
        const desactivar = await confirmar(
          `No se puede borrar "${esc(p?.nombre)}" porque tiene <strong>ventas registradas</strong> (se perdería el historial). ¿Quieres <strong>desactivarlo</strong> para quitarlo de la tienda?`,
          "Sí, desactivar");
        if (!desactivar) return;
        const { error: e2 } = await db.from("productos").update({ activo: false }).eq("id", id);
        if (e2) return toast("Error: " + e2.message, "error");
        toast("Producto desactivado (oculto en la tienda)");
        return cargarProductos();
      }
      return toast("Error: " + error.message, "error");
    }
    toast("Producto eliminado");
    await cargarProductos();
  }

  function resetFormProducto() {
    $("#form-producto").reset();
    $("#producto-id").value = "";
    $("#producto-activo").checked = true;
    $("#producto-imagen").required = true;
    imagenProducto = null;
    $("#producto-imagen-preview").hidden = true;
    $("#producto-imagen-preview").removeAttribute("src");
    $("#producto-stock").disabled = false;
    $("#nota-stock").hidden = true;
    $("#titulo-form-producto").textContent = "Agregar producto";
  }

  // ========================================================
  //  ALERTAS DE STOCK BAJO
  // ========================================================
  function mostrarAlertaStockBajo() {
    const bajos = productos.filter((p) => p.stock <= p.stock_minimo);
    if (!bajos.length) return;
    const lista = bajos
      .map((p) => `<li>${esc(p.nombre)} — quedan ${p.stock} (mínimo ${p.stock_minimo})</li>`)
      .join("");
    abrirModal("⚠️ Productos con stock bajo",
      `<p>Hay <strong>${bajos.length}</strong> producto(s) que necesitan reabastecimiento:</p>
       <ul class="lista-alerta">${lista}</ul>
       <div style="text-align:right;margin-top:18px"><button id="btn-cerrar-alerta" class="btn primario">Entendido</button></div>`);
    const btn = document.getElementById("btn-cerrar-alerta");
    if (btn) btn.addEventListener("click", cerrarModal);
  }

  // ========================================================
  //  MOVIMIENTOS
  // ========================================================
  function llenarSelectMovimientos() {
    const sel = $("#movimiento-producto");
    const actual = sel.value;
    sel.innerHTML = '<option value="">— Selecciona —</option>' +
      productos.map((p) => `<option value="${p.id}">${esc(p.nombre)} (stock: ${p.stock})</option>`).join("");
    sel.value = actual;
  }

  async function cargarMovimientos() {
    const { data, error } = await db
      .from("movimientos").select("*, productos(nombre)")
      .order("fecha", { ascending: false }).limit(100);
    if (error) return toast("Error al cargar movimientos: " + error.message, "error");
    renderMovimientos(data || []);
  }

  function renderMovimientos(movs) {
    const body = $("#movimientos-body");
    if (!movs.length) { body.innerHTML = '<tr><td colspan="6" class="vacio">Sin movimientos.</td></tr>'; return; }
    body.innerHTML = movs.map((m) => `
      <tr>
        <td>${m.id}</td>
        <td>${fechaCorta(m.fecha)}</td>
        <td>${esc(m.productos?.nombre || "—")}</td>
        <td><span class="pill ${m.tipo}">${m.tipo === "entrada" ? "Entrada" : "Salida"}</span></td>
        <td class="num">${m.tipo === "salida" ? "−" : "+"}${m.cantidad}</td>
        <td>${esc(m.motivo || "")}</td>
      </tr>`).join("");
  }

  async function registrarMovimiento(e) {
    e.preventDefault();
    const payload = {
      producto_id: $("#movimiento-producto").value,
      tipo: $("#movimiento-tipo").value,
      cantidad: parseInt($("#movimiento-cantidad").value, 10) || 0,
      motivo: $("#movimiento-motivo").value.trim() || null,
    };
    if (!payload.producto_id || payload.cantidad < 1) return toast("Selecciona producto y cantidad válida", "error");
    const { error } = await db.from("movimientos").insert(payload);
    if (error) return toast("Error: " + error.message, "error");
    toast("Movimiento registrado");
    cerrarFormModal("movimiento");
    await cargarProductos();
    await cargarMovimientos();
  }

  // ========================================================
  //  VENTAS (admin)
  // ========================================================
  const ESTADOS = ["pendiente", "pagada", "enviada", "entregada", "cancelada"];

  async function cargarVentas() {
    const { data, error } = await db
      .from("ventas").select("*")
      .order("creado_en", { ascending: false }).limit(100);
    if (error) return toast("Error al cargar ventas: " + error.message, "error");
    const ventas = data || [];
    // Nombres de clientes por separado (robusto ante cómo quedó la FK de ventas)
    const ids = [...new Set(ventas.map((v) => v.cliente_id))];
    const mapa = {};
    if (ids.length) {
      const { data: perfs } = await db.from("perfiles").select("id, nombre, email").in("id", ids);
      (perfs || []).forEach((p) => (mapa[p.id] = p));
    }
    renderVentas(ventas.map((v) => ({ ...v, perfiles: mapa[v.cliente_id] || null })));
  }

  function renderVentas(ventas) {
    const body = $("#ventas-admin-body");
    if (!ventas.length) { body.innerHTML = '<tr><td colspan="6" class="vacio">Sin ventas todavía.</td></tr>'; return; }
    body.innerHTML = ventas.map((v) => {
      const cliente = v.perfiles?.nombre || v.perfiles?.email || "—";
      const opciones = ESTADOS.map((s) =>
        `<option value="${s}" ${s === v.estado ? "selected" : ""}>${s}</option>`).join("");
      return `<tr>
        <td>#${v.id}</td>
        <td>${fechaCorta(v.creado_en)}</td>
        <td>${esc(cliente)}</td>
        <td class="num">${money(v.total)}</td>
        <td><select class="sel-estado" data-id="${v.id}">${opciones}</select></td>
        <td><button class="btn-mini" data-accion="detalle" data-id="${v.id}" title="Ver detalle">🔍</button></td>
      </tr>`;
    }).join("");
  }

  function onAccionVenta(e) {
    const btn = e.target.closest("button[data-accion='detalle']");
    if (btn) verDetalle(btn.dataset.id);
  }

  async function onCambioEstado(e) {
    const sel = e.target.closest("select.sel-estado");
    if (!sel) return;
    const { error } = await db.from("ventas").update({ estado: sel.value }).eq("id", sel.dataset.id);
    if (error) return toast("Error: " + error.message, "error");
    toast(`Venta #${sel.dataset.id} → ${sel.value}`);
  }

  async function verDetalle(id) {
    const { data, error } = await db
      .from("detalle_ventas").select("*, productos(nombre)").eq("venta_id", id);
    if (error) return toast("Error: " + error.message, "error");
    const filas = (data || []).map((d) => `
      <div class="pedido-lineas"><div>
        <span>${esc(d.productos?.nombre || "—")} × ${d.cantidad}</span>
        <span>${money(d.subtotal)}</span>
      </div></div>`).join("");
    const total = (data || []).reduce((a, d) => a + Number(d.subtotal), 0);
    abrirModal(`Detalle de la venta #${id}`,
      (filas || '<p class="vacio">Sin líneas.</p>') +
      `<p style="text-align:right;margin-top:12px;font-size:1.1rem"><strong>Total: ${money(total)}</strong></p>`);
  }
})();
