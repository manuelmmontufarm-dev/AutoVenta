# Guion de operación — AutoVenta

Lo que hay que tener resuelto **antes** de ponerle volumen real a Depot, y cómo
se hace cada cosa. El orden es de más urgente a menos.

---

## 1. Respaldos — probados, no solo configurados

Un respaldo que nunca se restauró no es un respaldo: es un archivo. El ciclo
completo está automatizado y **falla si el restore no cuadra fila por fila**:

```bash
cd app
DATABASE_URL='postgresql://…' node scripts/ops/backup-restore.mjs --salida ~/backups-autoventa
```

Hace dump → restaura en una base limpia → compara el conteo de las 11 tablas que
importan (`conversations`, `messages`, `quotes`, `follow_up_jobs`, …). Sale con
código 1 si alguna difiere.

**Verificado el 27-jul-2026** contra una base con datos: 11/11 tablas idénticas.

Pendiente tuyo, no automatizable desde aquí:
- Correrlo contra la base de **Depot** (hace falta su `DATABASE_URL` de Railway).
- **Guardar el `.dump` fuera de Railway.** Un respaldo en el mismo proveedor que
  la base no protege del caso que más duele: perder la cuenta.
- Ponerlo en un cron semanal. Railway tiene backups propios; esto no los
  reemplaza, los verifica.

---

## 2. Alertas — qué vigilar

`GET /health` ya devuelve todo lo necesario, sin autenticación:

```json
{ "ok": true,
  "catalog": { "items": 368, "lastSync": "…", "error": null },
  "worker":  { "ok": true, "lastBeatAt": "…", "secondsAgo": 3 } }
```

| Señal | Umbral | Por qué importa |
|---|---|---|
| `/health` no responde | 2 fallos seguidos | El bot está caído: los clientes escriben al vacío. |
| `worker.ok === false` | inmediato | **El agujero más silencioso.** El worker corre en otro proceso, sin healthcheck. Si muere, los seguimientos dejan de salir, el bot sigue contestando y el panel sigue abriendo: nada delata el problema. El latido se escribe cada ciclo (~5 s) y se marca caído a los 120 s. |
| `catalog.items === 0` | 15 min | El bot no puede cotizar; contesta pero no vende. |
| `catalog.error` no nulo | inmediato | Contífico caído o credencial vencida. |

Cualquier monitor externo sirve (UptimeRobot, Better Stack, el propio Railway).
Basta un GET cada minuto y una regla sobre el JSON.

---

## 3. Rollback

**`main` deploya a los DOS servicios: staging y Depot Tire.** (Esta línea decía
"solo a staging" y era falsa: el 7-ago se comprobó que los dos arrancan con el
mismo commit y con segundos de diferencia. Un push a main toca al cliente real.)
Para volver atrás:

```bash
git revert <sha>          # revert, NO reset: main es compartido y ya está desplegado
git push origin main      # Railway redeploya solo
```

Confirmar que entró comparando el bundle servido con el local:

```bash
curl -s https://autoventa-staging.up.railway.app/admin/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
ls app/site/admin/assets/*.js
```

Deben coincidir. Es la comprobación que destapó que un deploy anterior servía
código viejo.

**El esquema se aplica solo al arrancar y es idempotente** (`ensureSchema`), así
que un rollback de código no revierte migraciones. Ninguna migración hasta hoy
borra columnas, así que volver atrás es seguro; si alguna llegara a hacerlo,
hace falta el respaldo del punto 1 **antes** de desplegar.

---

## 4. Token permanente de WhatsApp — pendiente tuyo

**No puedo hacerlo yo:** requiere entrar a Meta Business Manager con tu cuenta.

El token de prueba de Meta **caduca a las 24 h**. Cuando caduca, el bot deja de
enviar y `POST /messages` responde código 190 — el diagnóstico de
Ajustes → WhatsApp lo distingue de un token mal copiado.

Lo que hay que hacer, en Meta Business Manager:
1. Crear un **System User** en Business Settings.
2. Asignarle la app de WhatsApp con permiso `whatsapp_business_messaging`.
3. Generar un token **sin expiración**.
4. Pegarlo en Ajustes → WhatsApp del panel (entra en caliente, sin redeploy).
5. Verificar con **Revisar conexión**: el chequeo de *Número* devuelve el número
   y el nombre verificado que Meta tiene registrados. Si coinciden, el token y
   el número son de la misma cuenta.

Hasta que esto esté hecho, cualquier prueba con clientes reales se cae sola al
día siguiente.

---

## 5. Antes de cada entrega

```bash
cd app
npm run typecheck && npm test        # 110 pruebas
npm run test:carga                   # 13 criterios, 50 clientes simultáneos
OPENAI_API_KEY=… npm run test:calidad   # calidad comercial (cuesta ~$0,30)
```

`test:carga` levanta todo aislado y no toca ni staging ni Meta.
`test:calidad` **sí gasta** en la API de OpenAI: son ~60 llamadas a
`gpt-4o-mini`, del orden de treinta centavos.

---

## Lo que sigue sin estar cubierto

Honestidad sobre el alcance, para que nadie lo lea como "ya está todo":

- **Sin réplicas.** El agrupador de mensajes y las colas por usuario viven en
  memoria del proceso. Levantar una segunda instancia del bot duplicaría
  respuestas. Escalar horizontalmente exige mover ese estado a Postgres.
- **Tras un reinicio, los mensajes en vuelo quedan guardados pero sin respuesta
  automática.** El asesor los ve en el Inbox y contesta. Automatizarlo pide un
  barrido de recuperación al arrancar, con su riesgo de responder dos veces.
- **Sin límite de gasto en OpenAI.** Nada corta si el consumo se dispara.
- **Sin retención de datos definida.** Las conversaciones se guardan indefinidamente.
