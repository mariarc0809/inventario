# Sistema de Inventario & Ventas (Web + Supabase)

Aplicación web con **HTML, CSS y JavaScript** (sin frameworks) y base de datos
**Supabase** (PostgreSQL). Incluye **login con roles**:

- 🛠️ **Admin**: gestiona productos, categorías, inventario (entradas/salidas con
  actualización automática de stock y alertas de stock bajo) y ve **todas las ventas**.
- 🛒 **Cliente**: ve el **catálogo**, agrega al **carrito** y **compra**. La compra
  descuenta el stock automáticamente y queda registrada en *Mis pedidos*.

## Estructura

```
inventario-web/
├── index.html            ← 3 vistas: login · admin · tienda
├── css/styles.css        ← estilos
├── js/config.js          ← TUS credenciales de Supabase (editar)
├── js/app.js             ← cliente, login/registro, sesión y rutas por rol
├── js/admin.js           ← panel admin (productos, categorías, movimientos, ventas)
├── js/tienda.js          ← tienda cliente (catálogo, carrito, compra, pedidos)
├── supabase_schema.sql   ← script de la base de datos (tablas, roles, triggers, RLS)
└── README.md
```

## Puesta en marcha

1. **Crea un proyecto** gratis en https://supabase.com.
2. **Crea la base de datos:** *SQL Editor → New query*, pega todo
   `supabase_schema.sql` y pulsa **Run**.
3. **Auth:** *Authentication → Providers → Email* y **desactiva "Confirm email"**
   (para entrar sin confirmar correo durante las pruebas).
4. **Credenciales:** copia *Project URL* y *anon key* (*Project Settings → API*) en
   `js/config.js`.
5. **Abre `index.html`** (o sírvelo con Live Server / `python -m http.server`).
6. **Regístrate** desde la pantalla de la app (rol *cliente* por defecto).
7. **Conviértete en admin** ejecutando en el SQL Editor (con tu correo):
   ```sql
   update perfiles set rol = 'admin' where email = 'TU_CORREO@ejemplo.com';
   ```
   Vuelve a iniciar sesión y entrarás al **panel de administración**.

## Cómo probar el flujo completo

1. Entra como **admin** → crea categorías y productos (con stock).
2. Cierra sesión y entra como **cliente** (otra cuenta) → agrega productos al
   carrito y pulsa **Comprar**.
3. Vuelve como **admin** → pestaña **Ventas**: verás la venta, podrás cambiar su
   estado y ver el detalle. El **stock** habrá bajado solo.

## Notas técnicas

- La compra usa la función `crear_venta(items jsonb)`: crea la venta y sus líneas
  en **una sola transacción**; si algún producto no tiene stock, se revierte todo.
- La seguridad es real con **RLS**: cada cliente solo ve sus pedidos; solo el admin
  gestiona inventario y ve todas las ventas.
- El esquema es para **PostgreSQL (Supabase)**. El enunciado mencionaba MySQL; se
  adaptó a Supabase como se pidió.
```
