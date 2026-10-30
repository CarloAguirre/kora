# LanguageTool — revisión gramatical del corrector

El corrector de Kora (`apps/web/src/shared/spellcheck`) tiene dos partes:

| | Qué marca | Dónde corre | Si no está disponible |
|---|---|---|---|
| **Ortografía** (subrayado rojo) | Palabras que no existen: `hla`, `prueva` | En el navegador (Hunspell + diccionario es-CL) | Siempre disponible |
| **Gramática** (subrayado azul) | Lo que solo se ve con el contexto: `como estas` → `cómo estás`, `tu` → `tú`, `mas` → `más`, concordancia, puntuación | [LanguageTool](https://languagetool.org) propio, vía `POST /api/language/check` | No se marca; la ortografía sigue funcionando |

LanguageTool corre en un servidor **propio** y no se usa la API pública: lo que se
revisa son descripciones de horas y bitácoras de clientes, y no debe salir de la
infraestructura de Kabeli. Es un servicio Java (LGPL) que necesita entre 1 y 2 GB
de RAM.

La API lo encuentra con la variable `LANGUAGETOOL_URL` (ver `apps/api/.env.example`).
Sin ella, la revisión gramatical queda apagada y la API arranca igual.

## Local (Windows, sin Docker)

Requiere Java 17 o superior (`java -version`).

1. Descargar y descomprimir la versión standalone:
   https://languagetool.org/download/LanguageTool-stable.zip
2. Levantar el servidor desde la carpeta descomprimida:

   ```sh
   java -Xmx1g -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081
   ```

   Escucha solo en `localhost` (para abrirlo a la red haría falta `--public`, que
   aquí no se necesita: solo lo consulta la API).
3. En `apps/api/.env`:

   ```sh
   LANGUAGETOOL_URL=http://127.0.0.1:8081
   ```

4. Reiniciar la API (el `.env` solo se lee al arrancar).

Para comprobarlo sin pasar por Kora:

```sh
curl -s -d "language=es" --data-urlencode "text=hola como estas" http://127.0.0.1:8081/v2/check
```

## Producción (Docker)

Junto a la API, en la misma red interna y **sin publicar el puerto** hacia
afuera:

```yaml
services:
  languagetool:
    image: erikvl87/languagetool:latest
    restart: unless-stopped
    environment:
      - Java_Xms=512m
      - Java_Xmx=1500m
    # Sin "ports": solo la API lo alcanza, por la red interna.
```

Y en el entorno de la API: `LANGUAGETOOL_URL=http://languagetool:8010`
(la imagen escucha en el 8010).

## Ajustes

- Qué se descarta: las coincidencias de ortografía de LanguageTool
  (`issueType: misspelling`), porque esas ya las marca el diccionario local
  (`CheckTextUseCase`).
- Cuándo se consulta: tras 800 ms sin escribir (`GRAMMAR_CHECK_DELAY_MS`), una
  petición por campo; cada cambio cancela la anterior.
- Tope de texto por petición: 20.000 caracteres (`LANGUAGE_CHECK_MAX_LENGTH`).
- Si alguna regla de LanguageTool resulta molesta, se puede apagar pasando
  `disabledRules` en `LanguageToolGrammarChecker`.
