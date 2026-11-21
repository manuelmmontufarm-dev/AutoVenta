/** Lo que arranca el Programador de tareas (y `Probar.bat`). */
import { principal } from "./principal.mjs";

// La tarea corre cada 5 minutos: una pasada colgada no puede quedarse viva
// para siempre en el servidor de otro. Explorar y el historial sí pueden tardar.
const larga = process.argv.some((a) => ["--explorar", "--buscar", "--muestra", "--historial"].includes(a));
if (!larga) setTimeout(() => process.exit(3), 4 * 60_000).unref();

principal().then((codigo) => process.exit(codigo), (error) => {
  console.error(error);
  process.exit(1);
});
