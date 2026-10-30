# Sesión y credenciales

El MCP entra a tres sitios: el **Campus** (Moodle), **Autogestión** (Sysacad) y el **correo** (Webmail e IMAP). Elige cómo darle el acceso; puedes cambiarlo cuando quieras:

| | A. Credenciales guardadas | B. Solo cookies |
| --- | --- | --- |
| Qué guardas | Usuario (DNI), contraseña y correo, cifrados por el sistema | Nada: solo cookies de sesión, cifradas |
| Cómo | `utn-mcp-mendoza setup-wizard` | `utn-mcp-mendoza login` |
| Campus | Se renueva solo al vencer | Repites `login` al vencer |
| Autogestión | Inicia sesión sola | Usa la sesión de `login` |
| Correo | IMAP (búsqueda completa) | Webmail (búsqueda acotada) |
| ¿El MCP ve tu contraseña? | Sí: la lee del almacén seguro | Nunca: la escribes tú en el navegador |

## A. Credenciales guardadas

Quedan cifradas (Secret Service, Keychain o DPAPI). Si la sesión del Campus vence, el MCP inicia sesión en segundo plano y repite la consulta, una sola vez por solicitud. Si el Campus rechaza la clave o muestra un captcha, no insiste ni lo evade: vuelve al login manual.

## B. Solo cookies

`utn-mcp-mendoza login` (o pide «conectame con el Campus» a tu cliente, que usa `start_login`) abre una ventana con **tres pestañas**: Campus, Autogestión y Webmail. Escribe tu usuario y contraseña solo ahí y elige tu legajo en Autogestión; al detectar las tres entradas (unos 5 minutos de margen) las cookies se guardan y la ventana se cierra sola. Si solo el Campus entró, se guarda igual y se avisa qué faltó. Las sesiones duran unas horas; la del Webmail depende del servidor y no se midió.

## Correo

Con credenciales y correo guardados usa IMAP. Si el servidor rechaza la clave y hay una sesión de `login`, sigue por el Webmail; sin credenciales va directo al Webmail; sin ninguna de las dos, el error dice cómo habilitarlas.

Por Webmail se lista, lee, marca y mueve a la Papelera igual que por IMAP (y leer no marca como leído), pero la búsqueda admite **un solo criterio** (`from`, `to`, `subject` o `text`, más `unseen_only`) sin `since`/`before`, y las fechas de las listas son las que muestra el sitio («Hoy 11:18»); `mail_read_message` sí da la fecha ISO. El usuario del correo es la dirección completa que ves al entrar a Autogestión.

## Comprobar y cerrar

`utn-mcp-mendoza status` (Campus) o `utn-mcp-mendoza doctor` (los tres sitios). No hace falta reiniciar el cliente de IA: detecta la sesión renovada. `logout` borra la sesión pero **no** las credenciales; `forget-credentials` las borra y vuelve al modo B.

> **Si no quieres que un agente con acceso a la terminal pueda leer tus credenciales,** usa el modo B. En el A viven en el almacén seguro de tu sesión y cualquier programa que corra como tu usuario (incluida la herramienta de shell de un agente) podría pedirlas; el MCP no las expone por ninguna herramienta, pero no puede impedir eso. Mitigación: reglas `deny` en tu cliente para `secret-tool`, `utn-mcp-mendoza` y la carpeta de sesión.

Siguiente paso: [Uso](uso.md).
