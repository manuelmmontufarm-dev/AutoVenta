/**
 * Loader de Node que sustituye `src/wa/client.ts` por `lib/wa-stub.mjs`.
 *
 * Por qué un loader y no una variable de entorno: la consigna era neutralizar
 * el envío SIN tocar src/. Un `if (EVAL_MODE)` dentro de wa/client.ts sería más
 * corto pero mete código de pruebas en la ruta de producción y depende de que
 * la variable esté puesta — si un día alguien corre el replay sin ella, le
 * escribe a 164 clientes reales. Sustituir el módulo en el resolver hace que el
 * fallo sea imposible por construcción: el archivo que habla con la Graph API
 * no se carga nunca, ni siquiera se lee del disco.
 *
 * Se engancha con:
 *   node --import tsx --import ./scripts/eval/lib/loader.mjs script.mjs
 *
 * Los hooks se encadenan: el registrado más tarde corre primero. Este llama a
 * `nextResolve` ANTES de decidir, así deja que tsx (o el resolver por defecto)
 * haga su trabajo y solo mira la URL ya resuelta. Funciona igual con .ts vía
 * tsx que con el dist/ compilado.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./loader-hooks.mjs", import.meta.url), pathToFileURL("./"));
