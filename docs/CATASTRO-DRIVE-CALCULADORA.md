# Catastro Drive para Calculadora

**Fecha:** 2026-10-21  
**Rama:** `feature/calculadora/carlo`

## Objetivo

Levantar cómo está organizada realmente la documentación accesible en Google Drive
y definir cómo Kora puede resolver una carpeta/proyecto para representarla en
Calculadora.

Este catastro se realizó consultando Drive directamente mediante el conector
disponible en el entorno de análisis. Ese acceso sirve para inspeccionar la
estructura real y diseñar la lógica; no implica que la API de Kora use las mismas
credenciales. La ejecución productiva seguirá utilizando el adaptador de Drive de
Kora.

## Hallazgo principal

La base de datos de Kora tiene soporte para `projects.documentation_link`, pero
actualmente ese campo no está poblado en los proyectos inspeccionados.

Al mismo tiempo, en Drive sí existe documentación de proyectos, organizada en
carpetas y subcarpetas que no siempre tienen una correspondencia directa 1:1 con
el nombre guardado en Kora.

Por lo tanto, para Calculadora no basta con:

```text
project.documentationLink
    -> listar archivos
```

Se necesita además una estrategia de **resolución de carpeta de proyecto**.

## Patrones observados en Drive

### Goldfields como carpeta cliente

Se encontró una carpeta de nivel cliente llamada:

```text
Goldfields
```

con subcarpetas que representan proyectos o iniciativas, entre ellas:

- AurelIA
- Crotales
- Portal PDC - Monitoreo previo
- Flora y Fauna
- Proyecto Portal PDC
- Proyecto Chinchillas
- Cotizaciones 2026 - 2027
- Análisis 2026 - 2027
- otros

Esto confirma que parte de la estructura de Drive se organiza como:

```text
Cliente
  -> Proyecto / iniciativa
```

### Proyecto AurelIA

La carpeta `AurelIA` tiene una estructura relativamente estándar:

```text
AurelIA
  01.Cotizaciones
  02.Contratos
  03.Documentación
  Calculadora
  Catastro GGEE - Power Map
```

Dentro de `03.Documentación` aparecen:

```text
01.KickOff
02.Presentación de Seguimiento
03.Documento de levantamiento detallado
04.Planificación Proyecto
05.Plan de Pruebas
06.Documentación de cierre de Proyecto
07.Formalización de Aprobación cliente
08.Ciber Seguridad
Documentación por módulos
matriz_de_modulos_ia_rpa.xlsx
```

Esto es exactamente el tipo de estructura que Calculadora puede aprovechar.

### Documentación por módulos

Dentro de AurelIA existe una carpeta `Documentación por módulos` con múltiples
carpetas funcionales:

- Monitoreo de Agua
- Gestión del cambio
- Capacitaciones ambiental
- Sustancias Peligrosas
- Monitoreo de Aire
- IA
- Impuesto Verde-Smart Green
- Gestión documental
- Incidentes
- Residuos
- SPR
- Registro de incumplimiento
- Inspecciones
- Controles Críticos
- otros

Esto muestra que la documentación de un proyecto puede estar distribuida a varios
niveles y no debe asumirse que todos los antecedentes están directamente en la
raíz.

### Crotales

El proyecto `Crotales` usa un patrón distinto: la raíz contiene directamente
archivos, por ejemplo:

- informes PDF;
- propuesta PPTX;
- documento con link Figma.

No tiene necesariamente la jerarquía Cotizaciones / Contratos / Documentación.

### Portal PDC - Monitoreo previo

Este proyecto usa una estructura más compacta:

```text
Portal PDC - Monitoreo previo
  1. Cotizaciones
  2. Contratos
  3. Documentación
```

### Documento de levantamiento detallado

También se encontraron carpetas denominadas:

```text
03.Documento de levantamiento detallado
```

Dentro de una de ellas existen elementos como:

- Roles.xlsx;
- Environmental_Critical_Controls_Specifications.pdf;
- subcarpeta Antiguo.

Este nombre de carpeta es especialmente relevante para el proceso de estimación.

## Lo que NO debe hacerse

### No usar búsqueda full-text como resolución automática

Una búsqueda Drive por el nombre de un proyecto puede devolver archivos cuyo
contenido menciona ese texto, aunque pertenezcan a otro proyecto.

Por ejemplo, una búsqueda textual por un nombre de proyecto puede encontrar un
DOCX relacionado indirectamente y no una carpeta del proyecto.

Por eso:

```text
Drive search textual
    !=
carpeta del proyecto confirmada
```

La resolución debe apoyarse principalmente en metadata de carpetas y jerarquía.

### No interpretar quotation_link como carpeta documental

En la BD se encontraron algunos links de Drive en `quotation_link`, pero la
mayoría corresponden a archivos individuales de cotización.

Por lo tanto:

```text
quotation_link /file/d/...
    -> archivo de cotización
    -> NO carpeta del proyecto

quotation_link /folders/...
    -> posible carpeta
    -> puede sugerirse, pero no asumirla como documentationLink
```

## Estrategia propuesta de resolución

La Calculadora debe resolver la carpeta con prioridades explícitas.

### Nivel 1 — link explícito

Si existe:

```text
project.documentationLink
```

y apunta a una carpeta Drive válida:

```text
confidence = 1.0
source = explicit
```

se utiliza directamente.

### Nivel 2 — carpeta ya confirmada para Calculadora

Una vez que un usuario confirme una carpeta, Kora debe persistir el vínculo para
no tener que buscarla otra vez.

Conceptualmente:

```text
projectId
driveFolderId
driveFolderUrl
source = manual | discovered
confidence
confirmedBy
confirmedAt
```

Puede reutilizarse `documentationLink` o introducirse una entidad específica si
se requiere versionar/manejar más de una fuente documental.

### Nivel 3 — discovery por metadata

Si no existe link explícito:

1. normalizar cliente;
2. localizar carpetas candidatas de cliente;
3. localizar hijos cuyo nombre se parezca al nombre del proyecto;
4. inspeccionar ancestros;
5. puntuar candidatos;
6. pedir confirmación humana si no hay certeza suficiente.

Ejemplo de scoring conceptual:

| Señal | Puntaje |
|---|---:|
| nombre carpeta = nombre proyecto normalizado | +50 |
| similitud alta de tokens | +30 |
| ancestro coincide con cliente | +25 |
| contiene Documentación / Levantamiento | +15 |
| contiene Cotizaciones/Contratos estándar | +5 |
| solo existe coincidencia en contenido de archivos | 0 |

No debe autoasignarse una carpeta por una coincidencia de texto en documentos.

## Normalización de nombres

Antes de comparar:

- lower-case;
- remover tildes;
- remover signos;
- colapsar espacios;
- tratar prefijos genéricos como `Proyecto` o `App` con menor peso;
- mantener términos distintivos;
- comparar tokens y no solo igualdad literal.

Ejemplo:

```text
"Proyecto Portal PDC"
"Portal PDC - Monitoreo previo"
```

deben reconocerse como candidatos relacionados, pero no como una coincidencia
automática perfecta.

## Inventario para Calculadora

Una vez resuelta la raíz del proyecto, la UI no debería simplemente mostrar
todos los archivos sin contexto.

La estrategia propuesta es clasificar por path y tipo.

### Prioridad alta para estimación

- levantamientos;
- requerimientos;
- especificaciones;
- flujos AS-IS / TO-BE;
- arquitectura;
- matrices funcionales;
- historias/casos existentes;
- presentaciones de kickoff con alcance;
- documentación por módulos;
- planificación cuando define fases/alcance.

### Prioridad media

- cotizaciones;
- contratos;
- planes de prueba;
- minutas;
- presentaciones de seguimiento;
- aprobaciones.

### Excluir por defecto del análisis IA

- credenciales;
- archivos llamados Acceso / Password / Secret / Keys;
- ejecutables/binarios;
- evidencias masivas;
- respaldos antiguos;
- APK;
- carpetas `Antiguo` salvo petición explícita;
- información no relacionada al alcance.

Durante el catastro se observaron archivos de tipo `Acceso.xlsx`, por lo que esta
regla debe ser explícita antes de habilitar lectura IA automática.

## Representación recomendada en el modal

Una vez encontrada la carpeta:

```text
Carpeta de Drive del levantamiento
[ enlace ]

Antecedentes detectados
📄 Acta de levantamiento.docx      hace 6 días
📄 Requerimientos.pdf             hace 6 días
📑 Diagrama AS-IS.pdf             hace 5 días
📄 Minuta cliente.docx            hace 3 días

+ 18 archivos adicionales
[Ver todos]
```

Si existe jerarquía:

```text
Antecedentes prioritarios
  03.Documento de levantamiento detallado
  Documentación por módulos

Otros documentos
  Cotizaciones
  Contratos
  Plan de Pruebas
```

La UI no necesita mostrar de inmediato todo el árbol de Drive.

## API propuesta

La API de Calculadora debería evolucionar desde el actual listado directo a dos
operaciones distintas.

### Resolver fuente

```http
POST /api/estimations/drive/resolve
```

Input conceptual:

```json
{
  "projectId": "...",
  "clientName": "Gold Fields",
  "projectName": "AurelIA"
}
```

Output:

```json
{
  "status": "resolved|needs_confirmation|not_found",
  "selectedFolder": {},
  "candidates": [],
  "confidence": 0.95
}
```

### Inventariar fuente confirmada

```http
POST /api/estimations/drive/inventory
```

Output conceptual:

```json
{
  "root": {},
  "summary": {
    "files": 48,
    "folders": 12
  },
  "recommendedSources": [],
  "otherSources": [],
  "excludedSources": []
}
```

El inventario puede limitar profundidad, por ejemplo 3 niveles, y excluir
carpetas irrelevantes antes de enviar cualquier contenido a IA.

## Separación de responsabilidades

```text
DriveProjectFolderResolver
    -> encuentra la carpeta correcta

DriveInventoryReader
    -> recorre árbol y metadata

DocumentSourceReader
    -> descarga/exporta contenido de archivos seleccionados

AI Project Analyzer
    -> interpreta el contenido seleccionado
```

No se deben mezclar estas responsabilidades en un solo servicio.

## Conclusión del catastro

Drive contiene suficiente estructura documental para soportar Calculadora, pero
la relación proyecto Kora -> carpeta Drive no está consolidada en la BD.

El problema a resolver no es solo "leer Drive"; primero es:

```text
identificar con confianza qué carpeta de Drive pertenece a cada proyecto
```

Una vez resuelta y confirmada esa asociación, el resto del pipeline puede
funcionar de forma estable:

```text
Proyecto Kora
  -> carpeta Drive confirmada
  -> inventario
  -> selección de antecedentes
  -> extracción
  -> predocumentos
  -> preguntas
  -> EDT
  -> estimación
```


## Estado de implementación · Resolver + inventario

La estrategia anterior ya cuenta con un primer vertical slice implementado.

### Resolución

Endpoint:

```http
POST /api/estimations/drive/resolve
```

El resolver usa, en orden:

1. `documentationLink` explícito si existe;
2. búsqueda de carpetas por términos significativos del nombre del proyecto;
3. búsqueda de carpetas cliente y revisión de hijos directos;
4. `quotationLink` únicamente cuando realmente apunta a `/folders/`;
5. scoring por nombre, términos coincidentes y jerarquía cliente.

Una coincidencia de alta confianza puede seleccionarse automáticamente. Las
coincidencias medias/bajas se devuelven como candidatos que el usuario debe
confirmar en el modal.

### Inventario

Endpoint:

```http
POST /api/estimations/drive/inventory
```

El inventario:

- recorre hasta 3 niveles por defecto;
- limita el resultado a 150 elementos;
- conserva path relativo;
- diferencia archivos y carpetas;
- clasifica documentos como recommended / secondary / excluded;
- evita recorrer carpetas marcadas como excluidas;
- identifica tipo documental para representación visual.

El modal `+ Nueva estimación` ya consume ambos endpoints:

```text
seleccionar prospecto
  -> resolver carpeta
  -> autoasignar si confianza alta
  -> mostrar candidatos si requiere confirmación
  -> inventariar carpeta elegida
  -> mostrar antecedentes prioritarios antes de crear la estimación
```

La asociación descubierta todavía no se persiste. Ese paso debe realizarse
cuando se defina si se reutiliza `projects.documentation_link` o se crea una
entidad versionable de fuentes documentales de estimación.


## Actualización · carpeta confirmada y análisis real

La Calculadora ya persiste una carpeta confirmada reutilizando
`projects.documentation_link`.

Además, el inventario diferencia entre:

- archivo visible en Drive;
- archivo excluido;
- archivo **analizable** por la PoC.

Los archivos analizables pueden alimentar el lector documental real. El flujo
actual selecciona hasta seis antecedentes priorizados y los entrega al proveedor
IA para una estimación ejecutiva por equipos/roles.

La asociación ya no queda únicamente en memoria del modal:

```text
carpeta elegida
  -> PATCH /projects/:id/extras
  -> documentation_link
  -> próxima estimación reutiliza el vínculo
```

El análisis detallado RF/HU/EDT permanece fuera del alcance de esta prueba.
