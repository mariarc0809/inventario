-- ============================================================================
--  SISTEMA DE INVENTARIO + VENTAS  ·  Roles: ADMIN y CLIENTE
--  Motor: PostgreSQL (Supabase)
--
--  CÓMO USARLO (manual):
--   1. Entra a tu proyecto en https://supabase.com
--   2. Menú izquierdo  ->  SQL Editor  ->  New query
--   3. Pega TODO este archivo y presiona  Run  (Ctrl+Enter)
--   4. (Auth) Authentication > Providers > Email: desactiva "Confirm email"
--      para poder iniciar sesión sin confirmar correo (recomendado en pruebas).
--   5. Regístrate desde la app o en Authentication > Users (Add user).
--   6. Conviértete en ADMIN ejecutando (cambia el correo):
--         update perfiles set rol = 'admin' where email = 'TU_CORREO@ejemplo.com';
--
--  NOTA sobre el "nombre de la base de datos":
--   En Supabase la base de datos siempre se llama  postgres  y todo vive en el
--   esquema  public . No se crea una BD "inventario_db" como en MySQL: el
--   "nombre" equivalente es el NOMBRE DE TU PROYECTO (puedes llamarlo inventario_db).
-- ============================================================================


-- ============================================================================
--  0)  LIMPIEZA OPCIONAL  (descomenta solo si quieres borrar y recrear TODO)
-- ============================================================================
-- drop table if exists detalle_ventas cascade;
-- drop table if exists ventas        cascade;
-- drop table if exists movimientos   cascade;
-- drop table if exists productos     cascade;
-- drop table if exists categorias    cascade;
-- drop table if exists perfiles      cascade;


-- ============================================================================
--  1)  PERFILES  (extiende auth.users con un ROL: admin / cliente)
-- ============================================================================
create table if not exists perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text,
  email      text,
  rol        text not null default 'cliente' check (rol in ('admin','cliente')),
  creado_en  timestamptz not null default now()
);

-- Función de ayuda: ¿el usuario actual es administrador?
-- (security definer = se salta RLS para evitar recursión al leer "perfiles")
create or replace function es_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'admin');
$$;

-- Al registrarse un usuario en Supabase Auth, se crea su perfil (rol cliente).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    'cliente'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Seguridad: un usuario NO puede cambiarse el rol a sí mismo.
-- Solo un admin (o el SQL Editor / service_role) puede cambiar roles.
create or replace function fn_proteger_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rol is distinct from old.rol
     and current_user in ('authenticated', 'anon')
     and not es_admin() then
    new.rol := old.rol;   -- ignora el intento de cambiar el rol
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_rol on perfiles;
create trigger trg_proteger_rol
  before update on perfiles
  for each row execute function fn_proteger_rol();


-- ============================================================================
--  2)  CATEGORIAS
-- ============================================================================
create table if not exists categorias (
  id          bigint generated always as identity primary key,
  nombre      text not null unique,
  descripcion text,
  creado_en   timestamptz not null default now()
);


-- ============================================================================
--  3)  PRODUCTOS   (relación: productos.categoria_id -> categorias.id)
-- ============================================================================
create table if not exists productos (
  id            bigint generated always as identity primary key,
  nombre        text    not null,
  descripcion   text,
  precio        numeric(12,2) not null default 0  check (precio >= 0),
  stock         integer not null default 0        check (stock >= 0),
  stock_minimo  integer not null default 5        check (stock_minimo >= 0),
  activo        boolean not null default true,     -- visible en la tienda
  imagen        text,                              -- foto del producto (base64, opcional)
  categoria_id  bigint  references categorias(id) on delete set null,
  creado_en     timestamptz not null default now()
);

create index if not exists idx_productos_categoria on productos(categoria_id);
create index if not exists idx_productos_nombre    on productos(nombre);


-- ============================================================================
--  4)  MOVIMIENTOS  (entradas/salidas de inventario) + recálculo de stock
-- ============================================================================
create table if not exists movimientos (
  id           bigint generated always as identity primary key,
  producto_id  bigint  not null references productos(id) on delete cascade,
  tipo         text    not null check (tipo in ('entrada','salida')),
  cantidad     integer not null check (cantidad > 0),
  motivo       text,
  fecha        timestamptz not null default now()
);

create index if not exists idx_movimientos_producto on movimientos(producto_id);

-- Trigger: suma (entrada) o resta (salida) el stock automáticamente.
create or replace function fn_actualizar_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.tipo = 'entrada') then
    update productos set stock = stock + new.cantidad where id = new.producto_id;
  elsif (new.tipo = 'salida') then
    if (select stock from productos where id = new.producto_id) < new.cantidad then
      raise exception 'Stock insuficiente para el producto %', new.producto_id;
    end if;
    update productos set stock = stock - new.cantidad where id = new.producto_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actualizar_stock on movimientos;
create trigger trg_actualizar_stock
  after insert on movimientos
  for each row execute function fn_actualizar_stock();


-- ============================================================================
--  5)  VENTAS  (cabecera: quién compra, estado y total)
-- ============================================================================
create table if not exists ventas (
  id         bigint generated always as identity primary key,
  cliente_id uuid not null references perfiles(id) on delete cascade,
  estado     text not null default 'pendiente'
             check (estado in ('pendiente','pagada','enviada','entregada','cancelada')),
  total      numeric(12,2) not null default 0,
  creado_en  timestamptz not null default now()
);

create index if not exists idx_ventas_cliente on ventas(cliente_id);


-- ============================================================================
--  6)  DETALLE_VENTAS  (líneas de cada venta)
--      subtotal = cantidad * precio_unitario  (columna calculada)
-- ============================================================================
create table if not exists detalle_ventas (
  id              bigint generated always as identity primary key,
  venta_id        bigint  not null references ventas(id) on delete cascade,
  producto_id     bigint  not null references productos(id),
  cantidad        integer not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  subtotal        numeric(12,2) generated always as (cantidad * precio_unitario) stored
);

create index if not exists idx_detalle_venta on detalle_ventas(venta_id);

-- Al agregar una línea: descuenta inventario (registra una salida) y
-- recalcula el total de la venta. security definer para que el CLIENTE
-- pueda comprar aunque no tenga permiso directo sobre movimientos/productos.
create or replace function fn_detalle_venta_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into movimientos (producto_id, tipo, cantidad, motivo)
    values (new.producto_id, 'salida', new.cantidad, 'Venta #' || new.venta_id);

  update ventas
     set total = (select coalesce(sum(subtotal), 0)
                    from detalle_ventas where venta_id = new.venta_id)
   where id = new.venta_id;

  return new;
end;
$$;

drop trigger if exists trg_detalle_venta_insert on detalle_ventas;
create trigger trg_detalle_venta_insert
  after insert on detalle_ventas
  for each row execute function fn_detalle_venta_insert();


-- ============================================================================
--  6.b)  CHECKOUT  ·  crea una venta con todas sus líneas en UNA transacción
--        El carrito se pasa como JSON: [{producto_id, cantidad, precio_unitario}, ...]
--        Si algún producto no tiene stock, se revierte TODO (venta incluida).
-- ============================================================================
create or replace function crear_venta(items jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  bigint;
  item  jsonb;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para comprar';
  end if;

  insert into ventas (cliente_id, estado)
    values (auth.uid(), 'pendiente')
    returning id into v_id;

  for item in select * from jsonb_array_elements(items)
  loop
    insert into detalle_ventas (venta_id, producto_id, cantidad, precio_unitario)
    values (
      v_id,
      (item->>'producto_id')::bigint,
      (item->>'cantidad')::integer,
      (item->>'precio_unitario')::numeric
    );
  end loop;

  return v_id;
end;
$$;

grant execute on function crear_venta(jsonb) to authenticated;


-- ============================================================================
--  7)  SEGURIDAD (RLS)  ·  quién puede ver/hacer qué
-- ============================================================================
alter table perfiles       enable row level security;
alter table categorias     enable row level security;
alter table productos      enable row level security;
alter table movimientos    enable row level security;
alter table ventas         enable row level security;
alter table detalle_ventas enable row level security;

-- Privilegios base (Supabase + RLS hacen el control fino por fila)
grant usage on schema public to anon, authenticated;
grant all on all tables    in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

-- ---- PERFILES: cada quien ve/edita el suyo; el admin, todos ----
drop policy if exists perfiles_propio        on perfiles;
drop policy if exists perfiles_update_propio on perfiles;
drop policy if exists perfiles_admin         on perfiles;
create policy perfiles_propio        on perfiles for select using (id = auth.uid() or es_admin());
create policy perfiles_update_propio on perfiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy perfiles_admin         on perfiles for all    using (es_admin())       with check (es_admin());

-- ---- CATEGORIAS: todos leen; solo admin modifica ----
drop policy if exists categorias_leer   on categorias;
drop policy if exists categorias_admin  on categorias;
create policy categorias_leer  on categorias for select using (true);
create policy categorias_admin on categorias for all    using (es_admin()) with check (es_admin());

-- ---- PRODUCTOS: todos leen (catálogo); solo admin modifica ----
drop policy if exists productos_leer   on productos;
drop policy if exists productos_admin  on productos;
create policy productos_leer  on productos for select using (true);
create policy productos_admin on productos for all    using (es_admin()) with check (es_admin());

-- ---- MOVIMIENTOS: solo admin (el trigger de ventas lo hace por dentro) ----
drop policy if exists movimientos_admin on movimientos;
create policy movimientos_admin on movimientos for all using (es_admin()) with check (es_admin());

-- ---- VENTAS: el cliente ve/crea las suyas; el admin gestiona todas ----
drop policy if exists ventas_ver      on ventas;
drop policy if exists ventas_crear    on ventas;
drop policy if exists ventas_admin    on ventas;
create policy ventas_ver   on ventas for select using (cliente_id = auth.uid() or es_admin());
create policy ventas_crear on ventas for insert with check (cliente_id = auth.uid());
create policy ventas_admin on ventas for all    using (es_admin()) with check (es_admin());

-- ---- DETALLE_VENTAS: ligado al dueño de la venta (o admin) ----
drop policy if exists detalle_ver    on detalle_ventas;
drop policy if exists detalle_crear  on detalle_ventas;
drop policy if exists detalle_admin  on detalle_ventas;
create policy detalle_ver on detalle_ventas for select using (
  exists (select 1 from ventas v where v.id = venta_id and (v.cliente_id = auth.uid() or es_admin()))
);
create policy detalle_crear on detalle_ventas for insert with check (
  exists (select 1 from ventas v where v.id = venta_id and (v.cliente_id = auth.uid() or es_admin()))
);
create policy detalle_admin on detalle_ventas for all using (es_admin()) with check (es_admin());


-- ============================================================================
--  8)  DATOS DE EJEMPLO  (categorías y productos)
-- ============================================================================
insert into categorias (nombre, descripcion) values
  ('Bebidas',  'Bebidas y refrescos'),
  ('Snacks',   'Botanas y golosinas'),
  ('Limpieza', 'Productos de aseo')
on conflict (nombre) do nothing;

insert into productos (nombre, descripcion, precio, stock, stock_minimo, categoria_id) values
  ('Coca-Cola 600ml', 'Refresco en botella', 1500, 24, 6, (select id from categorias where nombre='Bebidas')),
  ('Papas fritas 45g','Bolsa de papas',       1200,  4, 5, (select id from categorias where nombre='Snacks')),
  ('Detergente 1kg',  'Limpieza general',      8000, 10, 3, (select id from categorias where nombre='Limpieza'))
on conflict do nothing;


-- ============================================================================
--  9)  ÚLTIMO PASO  ->  conviértete en ADMIN (cambia el correo por el tuyo)
-- ============================================================================
-- update perfiles set rol = 'admin' where email = 'TU_CORREO@ejemplo.com';
