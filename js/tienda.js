// ============================================================
//  TIENDA (cliente)  ·  Catálogo, carrito, compra y mis pedidos
//  Expone:  window.initTienda()
// ============================================================
(function () {
  let catalogo = [];
  let carrito = [];   // [{ id, nombre, precio, cantidad, stock }]
  let montado = false;

  function initTienda() {
    if (!montado) { montarListeners(); montado = true; }
    cargarCatalogo();
    cargarPedidos();
  }
  window.initTienda = initTienda;

  function montarListeners() {
    let t;
    $("#buscar-catalogo").addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(renderCatalogo, 200);
    });
    $("#catalogo-grid").addEventListener("click", onCatalogoClick);

    $("#btn-carrito").addEventListener("click", abrirCarrito);
    $("#btn-cerrar-carrito").addEventListener("click", cerrarCarrito);
    $("#overlay").addEventListener("click", cerrarCarrito);
    $("#carrito-items").addEventListener("click", onCarritoClick);
    $("#btn-comprar").addEventListener("click", comprar);

    $("#btn-refrescar-pedidos").addEventListener("click", cargarPedidos);
  }

  // ========================================================
  //  CATÁLOGO
  // ========================================================
  async function cargarCatalogo() {
    const { data, error } = await db
      .from("productos").select("*, categorias(nombre)")
      .eq("activo", true).order("nombre");
    if (error) return toast("Error al cargar catálogo: " + error.message, "error");
    catalogo = data || [];
    renderCatalogo();
  }

  function renderCatalogo() {
    const grid = $("#catalogo-grid");
    const filtro = $("#buscar-catalogo").value.trim().toLowerCase();
    const lista = catalogo.filter((p) => p.nombre.toLowerCase().includes(filtro));
    if (!lista.length) { grid.innerHTML = '<p class="vacio">No hay productos.</p>'; return; }

    grid.innerHTML = lista.map((p) => {
      const agotado = p.stock <= 0;
      const cat = p.categorias?.nombre ? `<span class="tag pc-cat">${esc(p.categorias.nombre)}</span>` : "";
      const img = p.imagen
        ? `<img class="pc-img" src="${p.imagen}" alt="${esc(p.nombre)}" />`
        : `<div class="pc-img pc-img-vacia">📦</div>`;
      return `<div class="producto-card ${agotado ? "agotado" : ""}">
        ${img}
        ${cat}
        <div class="pc-nombre">${esc(p.nombre)}</div>
        <div class="pc-desc">${esc(p.descripcion || "")}</div>
        <div class="pc-precio">${money(p.precio)}</div>
        <div class="pc-stock">${agotado ? "Agotado" : "Disponibles: " + p.stock}</div>
        <div class="pc-add">
          ${agotado
            ? '<button class="btn" disabled>Sin stock</button>'
            : `<input type="number" min="1" max="${p.stock}" value="1" data-cant="${p.id}" />
               <button class="btn primario" data-add="${p.id}">Agregar</button>`}
        </div>
      </div>`;
    }).join("");
  }

  function onCatalogoClick(e) {
    const btn = e.target.closest("button[data-add]");
    if (!btn) return;
    const id = btn.dataset.add;
    const input = $(`input[data-cant="${id}"]`);
    const cant = Math.max(1, parseInt(input?.value, 10) || 1);
    agregarAlCarrito(id, cant);
  }

  function agregarAlCarrito(id, cantidad) {
    const p = catalogo.find((x) => String(x.id) === String(id));
    if (!p) return;
    const item = carrito.find((x) => String(x.id) === String(id));
    const enCarrito = item ? item.cantidad : 0;
    if (enCarrito + cantidad > p.stock) {
      return toast(`Solo hay ${p.stock} de "${p.nombre}"`, "error");
    }
    if (item) item.cantidad += cantidad;
    else carrito.push({ id: p.id, nombre: p.nombre, precio: Number(p.precio), cantidad, stock: p.stock, imagen: p.imagen });
    actualizarContador();
    renderCarrito();
    toast(`"${p.nombre}" agregado al carrito`);
  }

  // ========================================================
  //  CARRITO
  // ========================================================
  function actualizarContador() {
    const n = carrito.reduce((a, i) => a + i.cantidad, 0);
    $("#carrito-count").textContent = n;
  }

  function renderCarrito() {
    const cont = $("#carrito-items");
    if (!carrito.length) {
      cont.innerHTML = '<p class="vacio">Tu carrito está vacío.</p>';
      $("#carrito-total").textContent = money(0);
      $("#btn-comprar").disabled = true;
      return;
    }
    cont.innerHTML = carrito.map((i) => `
      <div class="carrito-item">
        ${i.imagen ? `<img class="ci-img" src="${i.imagen}" alt="">` : '<div class="ci-img-vacia">📦</div>'}
        <div class="ci-info">
          <div class="ci-nombre">${esc(i.nombre)}</div>
          <div class="ci-precio">${money(i.precio)} c/u</div>
        </div>
        <div class="ci-cant">
          <button data-dec="${i.id}">−</button>
          <span>${i.cantidad}</span>
          <button data-inc="${i.id}">+</button>
        </div>
        <button class="btn-mini borrar" data-del="${i.id}" title="Quitar">🗑️</button>
      </div>`).join("");
    const total = carrito.reduce((a, i) => a + i.precio * i.cantidad, 0);
    $("#carrito-total").textContent = money(total);
    $("#btn-comprar").disabled = false;
  }

  function onCarritoClick(e) {
    const btn = e.target.closest("button[data-inc], button[data-dec], button[data-del]");
    if (!btn) return;
    if (btn.dataset.inc) cambiarCantidad(btn.dataset.inc, +1);
    else if (btn.dataset.dec) cambiarCantidad(btn.dataset.dec, -1);
    else if (btn.dataset.del) quitar(btn.dataset.del);
  }

  function cambiarCantidad(id, delta) {
    const i = carrito.find((x) => String(x.id) === String(id));
    if (!i) return;
    const nueva = i.cantidad + delta;
    if (nueva < 1) return quitar(id);
    if (nueva > i.stock) return toast(`Solo hay ${i.stock} disponibles`, "error");
    i.cantidad = nueva;
    actualizarContador();
    renderCarrito();
  }

  function quitar(id) {
    carrito = carrito.filter((x) => String(x.id) !== String(id));
    actualizarContador();
    renderCarrito();
  }

  function abrirCarrito() {
    renderCarrito();
    $("#carrito-panel").hidden = false;
    $("#overlay").hidden = false;
  }
  function cerrarCarrito() {
    $("#carrito-panel").hidden = true;
    $("#overlay").hidden = true;
  }

  async function comprar() {
    if (!carrito.length) return;
    $("#btn-comprar").disabled = true;
    const itemsFactura = carrito.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, precio: i.precio }));
    const totalFactura = carrito.reduce((a, i) => a + i.precio * i.cantidad, 0);
    const items = carrito.map((i) => ({
      producto_id: i.id, cantidad: i.cantidad, precio_unitario: i.precio,
    }));
    const { data, error } = await db.rpc("crear_venta", { items });
    if (error) {
      $("#btn-comprar").disabled = false;
      if (/insuficiente|stock/i.test(error.message))
        return toast("Algún producto se quedó sin stock. Revisa tu carrito.", "error");
      return toast("No se pudo comprar: " + error.message, "error");
    }
    carrito = [];
    actualizarContador();
    renderCarrito();
    cerrarCarrito();
    mostrarFactura(data, itemsFactura, totalFactura);
    await cargarCatalogo(); // stock actualizado
    await cargarPedidos();
  }

  // ========================================================
  //  FACTURA (al terminar la compra)
  // ========================================================
  function generarFacturaHTML(ventaId, items, total, cliente, fecha) {
    const filas = items.map((i) => `
      <tr>
        <td>${esc(i.nombre)}</td>
        <td class="c">${i.cantidad}</td>
        <td class="r">${money(i.precio)}</td>
        <td class="r">${money(i.precio * i.cantidad)}</td>
      </tr>`).join("");
    return `
      <div class="factura">
        <h2>Factura N° ${String(ventaId).padStart(6, "0")}</h2>
        <p style="color:#64748b;margin:.2rem 0 14px">${fecha}</p>
        <div class="fac-cliente">
          <div class="fac-titulo">Datos del cliente</div>
          <div><strong>Nombre:</strong> ${esc(cliente.nombre)}</div>
          <div><strong>Correo:</strong> ${esc(cliente.email)}</div>
        </div>
        <div class="fac-titulo">Productos</div>
        <table class="fac-tabla">
          <thead><tr><th>Producto</th><th class="c">Cant.</th><th class="r">P. Unit.</th><th class="r">Subtotal</th></tr></thead>
          <tbody>${filas}</tbody>
          <tfoot><tr><td colspan="3" class="r"><strong>TOTAL</strong></td><td class="r"><strong>${money(total)}</strong></td></tr></tfoot>
        </table>
        <p class="fac-gracias">¡Gracias por tu compra!</p>
      </div>`;
  }

  function mostrarFactura(ventaId, items, total) {
    const p = (typeof perfilActual !== "undefined" && perfilActual) ? perfilActual : {};
    const correo = p.email || (typeof usuarioActual !== "undefined" && usuarioActual ? usuarioActual.email : "—");
    const cliente = { nombre: p.nombre || correo, email: correo };
    const fecha = new Date().toLocaleString("es-CO", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const html = generarFacturaHTML(ventaId, items, total, cliente, fecha);
    abrirModal("Factura",
      html + '<div style="text-align:right;margin-top:16px"><button id="btn-imprimir-factura" class="btn primario">🖨️ Imprimir / Guardar PDF</button></div>');
    const btn = document.getElementById("btn-imprimir-factura");
    if (btn) btn.addEventListener("click", () => imprimirFactura(html));
  }

  function imprimirFactura(html) {
    const w = window.open("", "_blank", "width=460,height=680");
    if (!w) { toast("Permite las ventanas emergentes para imprimir", "error"); return; }
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Factura</title><style>' +
      "body{font-family:'Segoe UI',system-ui,sans-serif;color:#1e293b;padding:24px}" +
      ".factura h2{margin:0;font-size:1.2rem}.fac-titulo{font-weight:700;margin:10px 0 6px}" +
      ".fac-cliente{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:.9rem;line-height:1.6;margin-bottom:8px}" +
      ".fac-tabla{width:100%;border-collapse:collapse;margin-top:8px;font-size:.9rem}" +
      ".fac-tabla th,.fac-tabla td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}" +
      ".fac-tabla .c{text-align:center}.fac-tabla .r{text-align:right}" +
      ".fac-tabla tfoot td{border-top:2px solid #1e293b;font-size:1rem}" +
      ".fac-gracias{text-align:center;color:#16a34a;margin-top:16px;font-weight:700}" +
      '</style></head><body onload="window.print()">' + html + "</body></html>");
    w.document.close();
  }

  // ========================================================
  //  MIS PEDIDOS
  // ========================================================
  async function cargarPedidos() {
    const { data, error } = await db
      .from("ventas")
      .select("*, detalle_ventas(*, productos(nombre))")
      .order("creado_en", { ascending: false });
    if (error) return toast("Error al cargar pedidos: " + error.message, "error");
    renderPedidos(data || []);
  }

  function renderPedidos(pedidos) {
    const cont = $("#pedidos-lista");
    if (!pedidos.length) { cont.innerHTML = '<p class="vacio">Aún no tienes pedidos.</p>'; return; }
    cont.innerHTML = pedidos.map((v) => {
      const lineas = (v.detalle_ventas || []).map((d) => `
        <div><span>${esc(d.productos?.nombre || "—")} × ${d.cantidad}</span><span>${money(d.subtotal)}</span></div>`).join("");
      return `<div class="pedido">
        <div class="pedido-head">
          <strong>Pedido #${v.id}</strong>
          <span>${fechaCorta(v.creado_en)}</span>
          <span class="pill ${v.estado}">${v.estado}</span>
          <strong>${money(v.total)}</strong>
        </div>
        <div class="pedido-lineas">${lineas || "—"}</div>
      </div>`;
    }).join("");
  }
})();
