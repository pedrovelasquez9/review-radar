# review-radar

[English](README.md) · **Español**

**Mod de Claude Code y plugin de OpenCode · v0.10.0.** Un panel de revisión para el humano en el bucle. Cuando el agente termina un feature, review-radar lee el diff de tu rama y muestra, **con las líneas del diff y sus archivos**, solo los cambios que una persona tiene que confirmar: lógica de negocio, arquitectura, datos y migraciones, secretos, servicios de terceros, seguridad, infraestructura, todo lo que parezca un error y **los cambios que nadie pidió**. El resto queda listado como «revisar en la PR». En [OpenCode](#opencode) la misma revisión vive en la barra lateral y en un diálogo.

Los cambios de cada versión están en el [changelog](CHANGELOG.md) (en inglés).

El objetivo: confirmar o pedir cambios sobre lo importante sin abrir los archivos uno a uno, y dejar lo rutinario para la pull request.

## Qué hace

- **Se ejecuta solo.** Al final de cada turno en el que pudieron cambiar archivos (Edit, Write, Bash…), compara el árbol de trabajo con el punto donde tu rama salió de la base (`origin/HEAD` y, si no existe, `origin/main`, `origin/master`, `main` o `master`). Incluye lo commiteado, lo pendiente y los archivos sin trackear.
- **Juzga por lo que hace el cambio, no por el stack.** No hay reglas por framework: el modelo clasifica cada cambio por su efecto. Funciona igual con TypeScript, Python, Go, Ruby, SQL, YAML o Terraform.
- **Enseña el cambio en el propio panel.** Cada hallazgo crítico trae su categoría, `archivo:línea`, una frase con qué revisar y el hunk del diff que lo contiene (una ventana alrededor de la línea si el hunk es largo).
- **Cierra el ciclo.** Cada hallazgo tiene dos botones (aquí con sus nombres en español; la interfaz sale en inglés salvo que configures `language: es`, ver [Configuración](#configuración)):
  - **✓ Revisado** lo pliega. La marca va ligada al código que viste: se mantiene en los siguientes análisis mientras ese hunk no cambie.
  - **Pedir cambios** escribe en tu prompt una petición de corrección completa: el hallazgo y su categoría, `archivo:línea`, el problema que supone, el código en revisión como diff y la instrucción de corregirlo (o revertirlo si no debería estar) dejando el resto como está. Añade lo que quieras y envíalo: la sesión lo corrige sin necesitar más contexto.
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
3. **Triaje (solo cuando los cambios no caben en una revisión).** Cada modelo de revisión tiene un presupuesto de diff que lee bien en una llamada: 150.000 caracteres para `opus` y `sonnet`, 100.000 para `haiku`. Si los archivos cambiados caben, todos pasan a la revisión a fondo. Si no caben, y solo en el modo `auto`, **Haiku** con esfuerzo bajo separa los archivos en *inspeccionar* o *rutinario* mirando solo sus líneas cambiadas. Los archivos de datos y configuración (por ruta y extensión), los que tienen un secreto los que Claude editó en esta sesión y los archivos de código con un **cambio de lógica** pasan siempre a la revisión a fondo, y el triaje ni siquiera los ve. Un cambio de lógica es una línea cambiada que altera una decisión o un cálculo (una condición, una comparación, lógica booleana, un número, un `return` o un `throw`), y se detecta sin modelo: cada línea se compara por su forma, así que los renombrados y el formato no cuentan, pero un `>` que pasa a `>=` o un `0.15` nuevo sí. La documentación, los estilos y los tests nunca cuentan. Un archivo que el triaje se salta o cuya respuesta no se puede leer se inspecciona. El modo `thorough` nunca hace triaje.
4. **Revisión a fondo.** El modelo de revisión (**Opus** por defecto, con esfuerzo alto) lee el diff de los archivos a inspeccionar con todo el código de alrededor que quepa sin una llamada más: la **función completa** que contiene cada cambio (`git diff --function-context`), si no 10 líneas alrededor, y si no el diff normal, junto con tus peticiones en esta sesión y los archivos que editó Claude, y devuelve un resumen y los hallazgos. Si los archivos a revisar no caben en su presupuesto, la revisión se reparte en partes (hasta 6 llamadas), y cada una sabe qué archivos leen las demás. Sus instrucciones quedan en la caché de prompts. Si ese modelo no puede responder (sin acceso, bloqueado por tu organización, un error de la API), revisa **Sonnet** y el resumen lo indica.
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
| `reviewMode` | `auto`, `thorough` | `auto` | `auto` aparta los archivos rutinarios con un modelo rápido solo cuando los cambios no caben en una revisión a fondo. `thorough` nunca lo hace: todos los archivos cambiados pasan por la revisión a fondo, en varias llamadas si hace falta. Más tokens en ramas grandes, y el triaje no descarta nada. |

Puedes configurarlas de cualquiera de estas formas:

- En una sesión: abre `/config` y cambia las filas *Language*, *Review model*, *Analyze automatically* y *Review mode*. El mod se recarga con los nuevos valores.
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

- Abre una sesión en un repositorio y trabaja como siempre. El panel **Revisión** (*Review* en inglés) se abre solo junto al chat al terminar el primer turno que deja cambios en la rama, ya con el indicador de carga, y se rellena al final de cada turno que cambió archivos (salvo con `autoAnalyze` desactivado). Fuera de un repositorio git, o mientras no haya cambios, sigue cerrado; `/review-radar` lo abre cuando quieras. Mientras se analiza, el panel se vacía y solo muestra un indicador destacado con la fase en curso (leyendo los cambios, clasificando archivos por riesgo, revisión a fondo con el modelo elegido); los nuevos resultados lo sustituyen cuando están listos. *Re-analizar* y `/review-radar` pasan al indicador al instante. Un aviso te indica cuándo hay algo que revisar.
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
- La revisión a fondo lee hasta 6 partes del presupuesto del modelo (900.000 caracteres con `opus`); los archivos que no entran aparecen en la lista de la PR como sin revisar y el resumen avisa del corte. Un solo archivo mayor que el presupuesto se corta. El triaje lee hasta 80.000 caracteres. Se leen como máximo 40 archivos sin trackear.
- La reutilización incremental conserva los hallazgos de los archivos sin cambios de un análisis anterior, así que el contexto entre archivos para esos viene de aquel análisis.
- Un turno cuyos cambios vienen solo de herramientas que no son Edit/Write/NotebookEdit/Bash/PowerShell (por ejemplo, una herramienta MCP), o de que edites archivos a mano, no se analiza solo: ejecuta `/review-radar`.
- En modo headless (`claude -p`, el SDK) solo se analiza al llamar a `/review-radar`.
- Los cambios no pedidos solo se juzgan en archivos que Claude editó con Edit, Write o NotebookEdit en la conversación principal. Los cambiados con Bash o por un subagente se revisan como cualquier otro cambio, pero no se comparan con tus peticiones.
- Un análisis solo se repite cuando cambia el diff, así que un prompt nuevo que amplía la tarea actualiza los hallazgos de cambios no pedidos en el siguiente cambio o con *Re-analizar*.

## OpenCode

review-radar también funciona en [OpenCode](https://opencode.ai) (1.17 o posterior) como plugin de la TUI, con el mismo análisis. OpenCode no tiene paneles laterales, así que la revisión vive en la terminal:

- **Barra lateral.** Al terminar el primer turno que deja cambios en la rama, la barra lateral de la sesión muestra una sección *Revisión*: en qué paso va el análisis mientras se ejecuta y, después, cuántos cambios requieren tu revisión y una línea por hallazgo (`[categoría] título` y `archivo:línea`). Los que marcas como revisados desaparecen. Al pulsarla se abre la revisión.
- **`/review-radar`** (también en la lista de comandos, *ctrl+p*) abre el diálogo de revisión: el resumen, los hallazgos por revisar, los revisados, lo que puede esperar a la PR y *Re-analizar*. Elige un hallazgo para ver por qué importa y su diff con los colores de diff del tema, y luego:
  - `r` lo marca como revisado (o lo vuelve a dejar sin revisar),
  - `c` escribe en el prompt la petición de corrección completa (como *Pedir cambios* en Claude Code) y cierra el diálogo,
  - `←` vuelve a la lista y `esc` cierra el diálogo.
- Un aviso te dice cuándo hay cambios que revisar.

OpenCode oculta la barra lateral en terminales estrechas (unas 120 columnas o menos): ensancha la ventana o abre la revisión con `/review-radar`.

### Instalación en OpenCode

Añade el paquete a la lista `plugin` de tu configuración de la TUI, `~/.config/opencode/tui.json` (todos los proyectos) o `.opencode/tui.json` (un proyecto), con sus opciones:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["opencode-review-radar", { "language": "es" }]]
}
```

Desde un clon local, pon la carpeta del clon en lugar del nombre del paquete (antes, ejecuta `bun install` en ella). Reinicia OpenCode para cargarlo.

| Opción | Valores | Por defecto |
| --- | --- | --- |
| `language` | `en`, `es` | `en` |
| `model` | `proveedor/modelo`, p. ej. `anthropic/claude-opus-5-5` | el modelo de la propia sesión |
| `triageModel` | `proveedor/modelo`, para clasificar diffs grandes | el modelo de revisión |
| `autoAnalyze` | `true`, `false` | `true` |
| `reviewMode` | `auto`, `thorough` (ver [Configuración](#configuración)) | `auto` |

Los modelos se consultan a través del propio OpenCode, así que vale cualquier proveedor que tengas configurado ahí. Cada consulta se hace en una sesión hija de la tuya con todas las herramientas desactivadas y todos los permisos denegados, de modo que el modelo solo puede responder; la sesión hija se borra al terminar. El presupuesto de la revisión sale de la ventana de contexto del modelo según la informa OpenCode (la mitad, a 3 caracteres por token, hasta 150.000 caracteres); para un modelo sin ventana conocida se suponen 48.000 caracteres. La calidad de la revisión depende del modelo: uno local pequeño puede pasar por alto hallazgos o responder en inglés.

### Límites en OpenCode

- Necesita la TUI: `opencode run` y otros usos sin interfaz no analizan.
- Se analiza cuando una sesión queda en reposo (el agente terminó su turno) y el diff de la rama cambió desde el último análisis.
- La categoría `unrequested` lee tus prompts y los archivos cambiados con `edit`, `write`, `multiedit` y `apply_patch`.

## Estructura del proyecto

El análisis es común; cada agente tiene un adaptador fino.

- `core/` es TypeScript sin API de ningún agente: el análisis solo habla con el agente a través del puerto `Engine` (`core/engine.ts`).
- `hooks/` es el mod de Claude Code. Claude Code solo permite usar su interfaz del motor (`$`) y declarar estado de sesión en el propio módulo de hooks, `register.tsx`, así que ese archivo construye el `Engine` a partir de `$` y le pasa al panel el estado que leyó.
- `opencode/` es el plugin de la TUI de OpenCode: su `Engine`, la barra lateral y el diálogo de revisión.

| Archivo | Responsabilidad |
| --- | --- |
| `core/engine.ts` | El puerto `Engine`: lo que el análisis necesita del agente, como funciones normales |
| `core/analysis.ts` | El flujo: leer el diff, reutilizar archivos sin cambios, triaje, revisión a fondo, añadir los extractos del diff y guardar el informe |
| `core/git.ts` | La rama base y el diff de la rama, archivos sin seguimiento incluidos |
| `core/diff.ts` | Lectura de un diff unificado: separación por archivo, lockfiles, hunks, extractos, hashes |
| `core/triage.ts` | Fase 1: prompt de triaje, su respuesta y los archivos que siempre se revisan a fondo |
| `core/review.ts` | Fase 2: prompt de revisión y su respuesta |
| `core/intent.ts` | Tus peticiones y los archivos que editó el agente, para la categoría `unrequested`; cada agente los lee de su propia conversación |
| `core/logic-change.ts` | Detección determinista de condiciones, comparaciones y números cambiados, que el triaje no puede descartar |
| `core/secrets.ts` | Detección determinista de secretos y su fusión con los hallazgos del modelo |
| `core/report-view.ts` | Lo que todas las vistas muestran igual: claves de revisado, el titular, el paso del indicador de carga |
| `core/text-report.ts` | El informe como texto, para `/review-radar` en Claude Code |
| `core/change-request.ts` | La petición de corrección que escribe *Pedir cambios* en el prompt |
| `core/messages.ts` | Todos los textos que ve la persona, en inglés y en español |
| `core/settings.ts` | La configuración común a todos los agentes |
| `core/json.ts` | Extraer el objeto JSON de la respuesta de un modelo |
| `hooks/register.tsx` | Punto de entrada de Claude Code: conecta los eventos del motor (inicio de sesión, el comando, llamadas a herramientas, fin de turno, dibujo del panel) con el análisis y el panel, y guarda el estado de la sesión |
| `hooks/models.ts` | Las llamadas a modelos de Claude Code, con el modelo de respaldo para la revisión |
| `hooks/transcript.ts` | Tus peticiones y las ediciones de Claude, desde la conversación de Claude Code |
| `hooks/pane.tsx` | El panel, como vista del informe y de las acciones de sus botones |
| `hooks/settings.ts` | Las opciones del mod y sus valores por defecto |
| `opencode/src/tui.ts` | Punto de entrada de OpenCode: el análisis al terminar el turno, el comando y la sección de la barra lateral |
| `opencode/src/engine.ts` | El `Engine` sobre la API de plugins de OpenCode, y qué modelo revisa |
| `opencode/src/models.ts` | Consultas al modelo en una sesión hija temporal sin herramientas ni permisos |
| `opencode/src/intent.ts` | Tus peticiones y las ediciones del agente, desde los mensajes de OpenCode |
| `opencode/src/store.ts` | El informe y las marcas de revisado: señales de Solid, guardadas por proyecto |
| `opencode/src/sidebar.ts`, `review-dialog.ts`, `elements.ts` | La barra lateral, el diálogo de revisión y los constructores de OpenTUI que usan |
| `opencode/src/settings.ts` | Las opciones del plugin y sus valores por defecto |
| `types/index.d.ts` | Tipos de hallazgo e informe, y el contrato de estado del mod |
| `tests/` | El núcleo y el mod de Claude Code: un archivo de tests por módulo, más `fixtures.ts` con diffs de ejemplo y un motor falso |
| `opencode/tests/` | El plugin de OpenCode: sus vistas dibujadas con el renderizador de pruebas de OpenTUI, y sus lectores |

## Desarrollo

Desde la carpeta:

```shell
claude plugin validate .
claude plugin test .
npx tsc -p .
```

Para el plugin de OpenCode:

```shell
bun install
bun test opencode
npx tsc -p opencode
```

`tsc` lee los tipos de Claude Code de `.claude-plugin/types/`, que Claude Code escribe la primera vez que carga el mod (instalado, o con `claude --plugin-dir .`). La carpeta no se versiona: contiene los conectores MCP de la máquina que cargó el mod.

## Licencia

[MIT](LICENSE) · [github.com/pedrovelasquez9/review-radar](https://github.com/pedrovelasquez9/review-radar)
