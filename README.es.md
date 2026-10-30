# review-radar

[English](README.md) · **Español**

**Mod de Claude Code · v0.2.0.** Un panel de revisión para el humano en el bucle. Cuando Claude termina un feature, review-radar lee el diff de tu rama y muestra, **con las líneas del diff y sus archivos**, solo los cambios que una persona tiene que confirmar: lógica de negocio, arquitectura, datos y migraciones, secretos, servicios de terceros, seguridad, infraestructura, todo lo que parezca un error y **los cambios que nadie pidió**. El resto queda listado como «revisar en la PR».

Los cambios de cada versión están en el [changelog](CHANGELOG.md) (en inglés).

El objetivo: confirmar o pedir cambios sobre lo importante sin abrir los archivos uno a uno, y dejar lo rutinario para la pull request.

## Qué hace

- **Se ejecuta solo.** Al final de cada turno en el que pudieron cambiar archivos (Edit, Write, Bash…), compara el árbol de trabajo con el punto donde tu rama salió de la base (`origin/HEAD` y, si no existe, `origin/main`, `origin/master`, `main` o `master`). Incluye lo commiteado, lo pendiente y los archivos sin trackear.
- **Juzga por lo que hace el cambio, no por el stack.** No hay reglas por framework: el modelo clasifica cada cambio por su efecto. Funciona igual con TypeScript, Python, Go, Ruby, SQL, YAML o Terraform.
- **Enseña el cambio en el propio panel.** Cada hallazgo crítico trae su categoría, `archivo:línea`, una frase con qué revisar y el hunk del diff que lo contiene (una ventana alrededor de la línea si el hunk es largo).
- **Cierra el ciclo.** Cada hallazgo tiene dos botones (aquí con sus nombres en español; la interfaz sale en inglés salvo que configures `language: es`, ver [Configuración](#configuración)):
  - **✓ Revisado** lo pliega. La marca va ligada al código que viste: se mantiene en los siguientes análisis mientras ese hunk no cambie.
  - **Pedir cambios** inserta `En archivo:línea (título): ` en tu prompt, para que solo escribas qué quieres cambiar.
- **Deja el resto para la PR.** Los cambios rutinarios (tests, docs, estilos, renombrados, refactors sin cambio de comportamiento) quedan plegados en *Revisar en la PR*.

### Categorías críticas

| Categoría | Qué cubre |
| --- | --- |
| `business-logic` | Reglas, cálculos, precios, transiciones de estado, validación de dominio, todo lo que cambia el comportamiento para el usuario o el dinero |
| `architecture` | Módulos o capas nuevas, cambios en el flujo de datos, responsabilidades movidas, cambios de API pública y contratos |
| `data` | Cambios de esquema y migraciones, backfills, operaciones destructivas, formatos de persistencia y serialización |
| `secrets` | Credenciales, claves, tokens, configuración que los contiene, cualquier cosa que pueda filtrarlos |
| `third-party` | Llamadas nuevas o modificadas a servicios externos, SDKs, webhooks, hosts nuevos, dependencias nuevas |
| `security` | Autenticación y autorización, límites de confianza, criptografía, CORS, superficies de inyección |
| `infra` | Despliegue, CI, contenedores, configuración de ejecución, feature flags de producción |
| `suspicious` | Errores probables en cualquier archivo: valores incoherentes con su entorno o con otros archivos, restos de copiar y pegar, cosas eliminadas que aún se usan, condiciones invertidas |
| `unrequested` | Cambios que Claude hizo en esta sesión y que ninguno de tus prompts pidió: un archivo ajeno a la tarea, un comportamiento cambiado más allá de lo pedido, una dependencia nueva, un refactor que nadie pidió. El hallazgo indica qué petición sobrepasa |

### Cambios que nadie pidió

Los asistentes de IA a veces hacen más de lo pedido: subir una versión porque lo dice una regla del proyecto, un refactor «ya que estaba», una dependencia añadida por el camino. review-radar compara lo que pediste en la sesión con lo que Claude editó de verdad:

- Lee tus prompts y los archivos que Claude editó (Edit, Write, NotebookEdit) de la propia conversación de la sesión, así que sigue funcionando tras recargar el mod o en una sesión reanudada.
- Solo se juzgan los archivos que Claude editó en esta sesión: el trabajo anterior de la rama nunca se marca como no pedido.
- No se marca lo que tu petición necesita para funcionar (imports, tipos, llamadas, tests y documentación del código pedido), y los prompts posteriores pueden ampliar los anteriores.
- No añade ninguna llamada al modelo: tus peticiones viajan en el mismo prompt de la revisión a fondo.

## Cómo funciona

1. **Diff.** `git diff` del árbol de trabajo contra el merge base, más los archivos sin trackear. Los lockfiles no se pasan a los modelos; solo sus nombres.
2. **Suelo de secretos.** Un escaneo determinista de las líneas añadidas busca credenciales literales (API keys, tokens, claves privadas, JWT). Si encuentra una, es crítica diga lo que diga el modelo.
3. **Triaje (solo diffs grandes).** Cuando los archivos cambiados suman 30.000 caracteres o más, **Haiku** con esfuerzo bajo separa los archivos en *inspeccionar* o *rutinario* mirando solo sus líneas cambiadas. Los archivos de datos y configuración (por ruta y extensión), los que tienen un secreto y los que Claude editó en esta sesión pasan siempre a la revisión a fondo. Un archivo que el triaje se salta o cuya respuesta no se puede leer se inspecciona.
4. **Revisión a fondo.** El modelo de revisión (**Opus** por defecto, con esfuerzo alto) lee el diff completo de los archivos a inspeccionar, junto con tus peticiones en esta sesión y los archivos que editó Claude, y devuelve un resumen y los hallazgos. Sus instrucciones quedan en la caché de prompts. Si ese modelo no puede responder (sin acceso, bloqueado por tu organización, un error de la API), revisa **Sonnet** y el resumen lo indica.
5. **Incremental.** Se guarda un hash del diff de cada archivo. En el siguiente turno solo se vuelven a enviar los archivos cuyo diff cambió; los demás conservan sus hallazgos (y el modelo los conoce). Un turno sin herramientas que modifiquen archivos ni siquiera ejecuta git. `/review-radar` y *Re-analizar* fuerzan una revisión completa.

## Requisitos

- Claude Code con soporte de mods, en la terminal o en una sesión local de la pestaña **Code** de Claude Desktop. Probado con **Claude Code 2.1.309 en Windows**.
- Un repositorio git. Fuera de uno, el panel dice *No es un repositorio git*.
- Acceso a modelos desde tu sesión de Claude Code: el de revisión (`opus` por defecto), `sonnet` como respaldo y `haiku` para el triaje de diffs grandes. **Cada análisis gasta tokens de tu cuenta**, y el diff se envía al modelo como cualquier otro prompt de tu sesión.
- Sin `npm install` ni paso de build.

## Instalación

### Desde GitHub (recomendado)

En el prompt de una sesión de Claude Code en la terminal:

```
/plugin install review-radar --marketplace pedrovelasquez9/review-radar
```

Responde `y` para añadir el marketplace, elige un alcance (el de usuario, el primero de la lista, lo activa para tu cuenta en este equipo) y configura las opciones o deja las de por defecto. El mod queda activo al momento.

Desde una shell:

```shell
claude plugin install review-radar --marketplace pedrovelasquez9/review-radar
```

En la app de escritorio de Claude, donde `/plugin` no funciona: pulsa **+** junto al cuadro del prompt, luego **Plugins**, **Add marketplace** con `pedrovelasquez9/review-radar` y después **Add plugin**.

Las sesiones que ya estaban abiertas lo cargan tras `/reload-plugins`.

### Desde un clon local

Dentro de la carpeta `review-radar` clonada:

```shell
claude plugin marketplace add .
claude plugin install review-radar@review-radar --scope user
```

No muevas la carpeta: el marketplace lee de ella, así que tus cambios llegan a las sesiones tras `/reload-plugins`.

### Probarlo en una sola sesión

```shell
claude plugin validate .
claude --plugin-dir .
```

No cargues a la vez una copia instalada y otra con `--plugin-dir`.

## Configuración

| Opción | Valores | Por defecto | Qué hace |
| --- | --- | --- | --- |
| `language` | `en`, `es` | `en` | Idioma del panel, del informe y de los resúmenes y hallazgos del modelo. Al cambiarlo, el siguiente análisis se rehace en el nuevo idioma. |
| `reviewModel` | `opus`, `sonnet`, `haiku` | `opus` | Modelo de la revisión a fondo. `sonnet` es más barato y rápido; `haiku` es el más barato y detecta menos. Si el elegido no puede responder, revisa `sonnet`. |
| `autoAnalyze` | `true`, `false` | `true` | Analiza al final de cada turno que cambió archivos. Con `false`, solo `/review-radar` y *Re-analizar* lanzan un análisis, así que solo gastas tokens cuando lo pides. |

Puedes configurarlas de cualquiera de estas formas:

- En una sesión: abre `/config` y cambia las filas *Language*, *Review model* y *Analyze automatically*. El mod se recarga con los nuevos valores.
- Al instalar:

  ```shell
  claude plugin install review-radar@review-radar --scope user --config language=es --config autoAnalyze=false
  ```

- En `~/.claude/settings.json`:

  ```json
  {
    "pluginConfigs": {
      "review-radar@review-radar": {
        "options": { "language": "es", "reviewModel": "sonnet", "autoAnalyze": true }
      }
    }
  }
  ```

## Uso

- Abre una sesión en un repositorio y trabaja como siempre. El panel **Revisión** (*Review* en inglés) se abre junto al chat y se rellena al final de cada turno que cambió archivos (salvo con `autoAnalyze` desactivado). Un aviso te indica cuándo hay algo que revisar.
- `/review-radar` abre el panel, fuerza un análisis completo y además escribe el informe, diffs incluidos, en la conversación. En una rama mediana tarda unos 20–30 s.
- En el panel: lee el resumen, recorre *Requiere tu revisión*, marca cada hallazgo con **✓ Revisado** o pulsa **Pedir cambios**, y despliega *Revisar en la PR* si quieres la lista completa.

### Actualizar o desinstalar

```shell
claude plugin marketplace update review-radar
claude plugin update review-radar@review-radar
```

Después, `/reload-plugins`. Usa `/plugin` para desactivarlo o desinstalarlo.

## Límites

- Decidir si un cambio es lógica de negocio, arquitectura o un error es criterio del modelo: puede pasar algo por alto o variar entre ejecuciones. Solo el escaneo de secretos es determinista. Usa review-radar para enfocar tu revisión, no para sustituirla.
- La revisión a fondo lee hasta 150.000 caracteres de diff; si hay más, el resumen avisa de que se truncó. El triaje lee hasta 80.000. Se leen como máximo 40 archivos sin trackear.
- La reutilización incremental conserva los hallazgos de los archivos sin cambios de un análisis anterior, así que el contexto entre archivos para esos viene de aquel análisis.
- Un turno cuyos cambios vienen solo de herramientas que no son Edit/Write/NotebookEdit/Bash/PowerShell (por ejemplo, una herramienta MCP), o de que edites archivos a mano, no se analiza solo: ejecuta `/review-radar`.
- En modo headless (`claude -p`, el SDK) solo se analiza al llamar a `/review-radar`.
- Los cambios no pedidos solo se juzgan en archivos que Claude editó con Edit, Write o NotebookEdit en la conversación principal. Los cambiados con Bash o por un subagente se revisan como cualquier otro cambio, pero no se comparan con tus peticiones.
- Un análisis solo se repite cuando cambia el diff, así que un prompt nuevo que amplía la tarea actualiza los hallazgos de cambios no pedidos en el siguiente cambio o con *Re-analizar*.

## Estructura

Claude Code solo deja que un mod use la interfaz del motor (`$`) y declare estado de sesión en el propio módulo de hooks, `register.tsx`. Por eso `register.tsx` es el único archivo que habla con el motor: envuelve lo que necesita el resto en funciones simples (`engine.ts`) y le pasa al panel el estado que lee. Todos los demás archivos son TypeScript normal, que se puede leer y probar por separado.

| Archivo | Responsabilidad |
| --- | --- |
| `hooks/register.tsx` | Punto de entrada: conecta los eventos del motor (inicio de sesión, el comando, llamadas a herramientas, fin de turno, dibujo del panel) con el análisis y el panel, guarda el estado de la sesión y lee la conversación para `intent.ts` |
| `hooks/engine.ts` | La interfaz `Engine`: lo que el análisis necesita de Claude Code, como funciones simples |
| `hooks/analysis.ts` | El flujo: leer el diff, reutilizar archivos sin cambios, triaje, revisión a fondo, añadir los fragmentos del diff y guardar el informe |
| `hooks/git.ts` | La rama base y el diff de la rama, archivos sin trackear incluidos |
| `hooks/diff.ts` | Lectura de un diff unificado: separación por archivo, lockfiles, hunks, fragmentos y hashes |
| `hooks/triage.ts` | Fase 1: prompt del triaje, su respuesta y los archivos que siempre se revisan a fondo |
| `hooks/review.ts` | Fase 2: prompt de la revisión y su respuesta |
| `hooks/intent.ts` | Tus peticiones y los archivos que editó Claude, leídos de la conversación de la sesión, para la categoría `unrequested` |
| `hooks/secrets.ts` | Escaneo determinista de secretos y su fusión con los hallazgos del modelo |
| `hooks/models.ts` | Llamadas a los modelos de triaje y revisión, con el respaldo del de revisión |
| `hooks/pane.tsx` | El panel, como vista del informe y de las acciones de sus botones |
| `hooks/text-report.ts` | El informe como texto, para `/review-radar` |
| `hooks/messages.ts` | Todos los textos que ve la persona, en inglés y en español |
| `hooks/settings.ts` | Las opciones del plugin y sus valores por defecto |
| `hooks/json.ts` | Extraer el objeto JSON de la respuesta de un modelo |
| `types/index.d.ts` | Tipos de hallazgos e informe, y el contrato de estado del mod |
| `tests/` | Un archivo de tests por módulo, más `fixtures.ts`: diffs de ejemplo y un motor falso que responde como git y como un modelo |

## Desarrollo

Desde dentro de la carpeta:

```shell
claude plugin validate .
claude plugin test .
npx tsc -p .
```

`tsc` lee los tipos de Claude Code de `.claude-plugin/types/`, que Claude Code escribe la primera vez que carga el mod (instalado, o con `claude --plugin-dir .`). La carpeta no se versiona: contiene los conectores MCP de la máquina que cargó el mod.

## Licencia

[MIT](LICENSE) · [github.com/pedrovelasquez9/review-radar](https://github.com/pedrovelasquez9/review-radar)
