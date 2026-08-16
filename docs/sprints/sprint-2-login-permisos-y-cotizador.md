# Sprint 2 · Login con usuarios y permisos (base) + fix «Guardar imagen» del cotizador

**Modelo recomendado:** Sonnet · razonamiento medio. Es plomería de UI + un endpoint
sencillo; el diseño ya está decidido aquí. Subir a alto solo si el token/middleware se
complica.

**Archivos que toca:**
- `app/src/server/auth.ts` — **nuevo**: usuarios, sesiones y middleware
- `app/src/server/admin.ts` — solo el gate de autenticación (aceptar token además de `x-admin-key`) y `POST /api/auth/login`
- `hub/src/components/admin-key.tsx` → se convierte en la pantalla de login
- `hub/src/data/realSource.ts` — guardar sesión (token + usuario + rol) en vez de solo la key
- `hub/src/App.tsx` — botón de logout y nombre del usuario visible
- `hub/src/screens/Cotizador.tsx` + `hub/src/lib/quoteImage.ts` — la imagen de opciones

**Independencia (este sprint corre EN PARALELO con 1, 3 y 4 — no asumir nada de ellos):**
- La rama parte de `main`. El rol de la sesión (`admin`/`asesor`) es del LOGIN; no tocar
  la tabla `advisors` ni sus rutas (eso es del S3 — son dos conceptos distintos adrede).
- Dejar el rol disponible en `req` (p.ej. `req.authUser`) como interfaz estable; el S5
  cablea a quien lo necesite.
- `admin.ts` lo tocan también S3/S4 (rutas propias): mantener el cambio del gate compacto
  y al inicio del archivo para que el conflicto de merge sea trivial.

---

## Parte A · Login

### Requerimiento (reunión del 14-ago + pedido de Manuel)

- Al abrir el hub: pantalla de login con **dropdown** de usuarios:
  **Manuel Montufar · Andres Tamayo · Joaquin Tamayo · Asesor**.
- Clave de todos por ahora: **1234**.
- Por ahora **todos ven todo** — la estructura de permisos queda lista para diferenciar
  después (Andrés en la reunión: que algunos no vean lo vendido total, etc.).
- Botón de **log out** visible.

### Diseño

1. **`auth.ts` (server)**. Lista de usuarios en código (después se moverá a `settings`):
   ```ts
   const USERS = [
     { id: "manuel",  nombre: "Manuel Montufar", rol: "admin"  },
     { id: "andres",  nombre: "Andres Tamayo",   rol: "admin"  },
     { id: "joaquin", nombre: "Joaquin Tamayo",  rol: "admin"  },
     { id: "asesor",  nombre: "Asesor",          rol: "asesor" },
   ];
   const PIN = "1234"; // temporal, pedido explícito del cliente
   ```
   `POST /api/auth/login {userId, pin}` → si el pin coincide, devuelve
   `{token, user:{id,nombre,rol}, permisos}`. Token = HMAC-SHA256 de
   `userId.expiración` firmado con `ADMIN_KEY` (sin tabla nueva, sin dependencias),
   expiración 30 días. `GET /api/auth/users` (público) devuelve la lista de nombres
   para poblar el dropdown.
2. **Gate**: el middleware actual de `admin.ts` acepta `x-admin-key === ADMIN_KEY`
   (compatibilidad: el bot, scripts y el panel central siguen funcionando) **o**
   `authorization: Bearer <token>` válido. El rol viaja en `req` para el Sprint 3 y
   futuros permisos.
3. **Permisos**: objeto `permisos` por rol (`verFinanzas`, `verAjustes`, `verErrores`,
   `usarCotizador`, `verKanban`…) — **hoy todos en `true` para todos los roles**. El hub
   los guarda y los componentes los leerán cuando se quieran diferenciar (no condicionar
   nada todavía, solo dejar el hook `usePermisos()` listo).
4. **Hub**: `admin-key.tsx` se rediseña como login (dropdown + campo de clave + Conectar,
   mismo estilo actual). `realSource.ts` guarda `{token, user}` en
   `localStorage autoventa_session_v1`; migración: si existe la vieja
   `autoventa_admin_key`, se sigue aceptando hasta que el usuario haga login una vez.
   Las llamadas mandan `Authorization: Bearer` con fallback a `x-admin-key`.
5. **Logout**: en la barra del hub (donde hoy sale el chip de versión/estado), mostrar
   el nombre del usuario + botón «Salir» → borra la sesión y vuelve al login.

### Criterios de aceptación

- Login con cualquiera de los 4 usuarios y clave 1234; clave errada rebota con mensaje.
- Refrescar la página mantiene la sesión; «Salir» la borra y muestra el login.
- El panel central `/panel` (que usa `x-admin-key`) sigue funcionando sin cambios.
- El nombre del usuario logueado es visible en el hub.

---

## Parte B · «Guardar imagen para WhatsApp» del cotizador (acción de la reunión)

En la demo con Andrés, el botón **📷 Guardar imagen para WhatsApp** del tab de
**opciones** del Cotizador generó la pieza **antigua** («esto está en la antigua, tengo
que actualizarlo» — min 18:31). El bot ya manda la pieza nueva (paleta «Depot Tire rojo»,
garantías e INCLUIDO en grande, sello de medida exacta/equivalente en cada tarjeta).

### Tarea

- Detectar por qué `quoteImage.ts` (render cliente) quedó atrás del render del server
  (`/api/catalog/options-message` / `render/`): comparar y decidir **una sola fuente**.
  Preferencia: que el hub pida la imagen al server (misma ruta que usa el bot) y solo la
  descargue — un render, cero divergencia futura. Si el server no expone la imagen de
  opciones como PNG directo, exponer `GET /api/catalog/options-image` reusando el
  renderer del bot.
- Aplicar lo mismo a la imagen de **comparativa** del cotizador si sufre la misma
  divergencia (verificar).
- La cotización manual ya sale bien por el chat — no tocar ese camino.

### Criterios de aceptación

- La imagen descargada desde el Cotizador es **pixel-igual** al estilo que manda el bot
  (paleta roja, garantías grandes, sello de medida).
- Funciona en Safari y Chrome (la descarga por blob difiere en Safari — probar).

## Qué NO hacer

- No implementar restricciones reales por rol (solo la estructura).
- No tocar notificaciones ni asesores (Sprint 3), ni detector/guardián (Sprint 1).
- No cambiar la clave 1234 por nada «más seguro» sin que lo pida el cliente: es una
  decisión explícita de esta fase.
