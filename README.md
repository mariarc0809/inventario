# Sistema de Inventario & Ventas (Web + Supabase)

Aplicación web hecha con **HTML, CSS y JavaScript** (sin frameworks) y base de datos
**Supabase** (PostgreSQL). Tiene **login con roles** y dos experiencias distintas
según quién entra:

- 🛠️ **Administrador**: gestiona el inventario y ve todas las ventas.
- 🛒 **Cliente**: ve el catálogo, compra y recibe su factura.

---

## ✨ Características

**Administrador**
- **Productos**: agregar, editar, eliminar y buscar. Formulario en **modal**, con
  **imagen subida desde el PC** (se comprime sola) y **todos los campos obligatorios**.
- **Categorías**: crear, editar y eliminar (formulario en modal).
- **Inventario**: registrar **entradas y salidas**; el **stock se actualiza solo**.
- **Alerta de stock bajo**: aparece en un **modal al iniciar sesión**.
- **Ventas**: ver todas, cambiar el estado y ver el detalle de cada una.

**Cliente (tienda)**
- **Catálogo** de productos con su imagen y precio.
- **Carrito** con miniaturas y control de cantidades.
- **Compra** en una sola transacción → genera una **factura** (con datos del cliente
  y sus productos) que se puede **imprimir o guardar en PDF**.
- **Mis pedidos**: historial de compras con su estado.

**General**
- Precios en **pesos colombianos (COP)**: `$1.500`, `$8.000`…
- Seguridad real con **RLS**: cada cliente solo ve lo suyo; solo el admin gestiona todo.
- **Sin caché molesta**: la app siempre carga la última versión (no hace falta Ctrl+F5).

---

## 📁 Estructura

```
inventario-web/
├── index.html            ← 3 vistas: login · admin · tienda
├── css/styles.css        ← estilos
├── js/config.js          ← TUS credenciales de Supabase (editar)
├── js/app.js             ← cliente, login/registro, sesión, rutas por rol, utilidades
├── js/admin.js           ← panel admin (productos, categorías, movimientos, ventas)
├── js/tienda.js          ← tienda cliente (catálogo, carrito, compra, factura, pedidos)
├── supabase_schema.sql   ← script de la base de datos (tablas, roles, triggers, RLS)
└── README.md
```

**Base de datos** (esquema `public`): `perfiles`, `categorias`, `productos`,
`movimientos`, `ventas`, `detalle_ventas` + función `crear_venta()` y triggers de
stock y seguridad.

---

## 🚀 Puesta en marcha

1. **Crea un proyecto** gratis en https://supabase.com.
2. **Crea la base de datos:** *SQL Editor → New query*, pega todo el contenido de
   `supabase_schema.sql` y pulsa **Run**.
3. **Auth:** ve a *Authentication → Providers → Email* y **desactiva "Confirm email"**
   (para poder entrar sin confirmar el correo).
4. **Credenciales:** copia *Project URL* y *anon key* (*Project Settings → API*) en
   `js/config.js`.
5. **Abre la app:** abre `index.html`, o sírvela con *Live Server* o
   `python -m http.server 5500` y entra a `http://localhost:5500`.
6. **Regístrate** desde la pantalla de la app (entrarás como **cliente**).
7. **Conviértete en admin** ejecutando en el *SQL Editor* (con tu correo):
   ```sql
   update perfiles set rol = 'admin' where email = 'TU_CORREO@ejemplo.com';
   ```
   Cierra sesión, vuelve a entrar y verás el **panel de administración**.

---

## ✅ Probar el flujo completo

1. Entra como **admin** → crea **categorías**, luego **productos** (con stock e imagen).
2. Cierra sesión y entra como **cliente** (otra cuenta) → añade productos al **carrito**
   y pulsa **Comprar** → aparece tu **factura**.
3. Vuelve como **admin** → pestaña **Ventas**: verás la venta y podrás cambiar su
   estado. El **stock habrá bajado solo**. ✔️

---

## 🛠️ Notas técnicas

- **Compra transaccional:** la función `crear_venta(items jsonb)` crea la venta y todas
  sus líneas en **una sola transacción**; si un producto no tiene stock, se revierte todo.
- **Stock automático:** un trigger en `movimientos` ajusta el stock; al vender se registra
  una salida automáticamente.
- **Eliminar productos:** si un producto **tiene ventas**, no se borra (rompería el
  historial); la app ofrece **desactivarlo** (se oculta de la tienda). Sin ventas, se borra.
- **Imágenes:** se guardan como `base64` en la columna `productos.imagen` (se reducen en el
  navegador antes de guardar). Si tu base ya existía, añade la columna con:
  ```sql
  alter table productos add column if not exists imagen text;
  ```
- **Seguridad de roles:** el trigger `fn_proteger_rol` impide que un usuario se cambie el
  rol a sí mismo; solo un admin (o el SQL Editor) puede asignar roles.
- **Motor:** el esquema es para **PostgreSQL (Supabase)**. El enunciado original mencionaba
  MySQL; se adaptó a Supabase como se pidió.

---

## ☁️ Despliegue (opcional)

Es un sitio **estático**, así que **no necesita variables de entorno** (las credenciales
están en `js/config.js`, y la *anon key* es pública por diseño, protegida por RLS).

En Vercel / Netlify:
- **Root Directory:** `inventario-web` (donde está `index.html`)
- **Framework Preset:** *Other* / Ninguno
- **Build Command:** vacío · **Output:** la misma carpeta

Pulsa *Deploy* y la app queda en línea funcionando contra tu Supabase.
