# Infraestructura de Estimación

Esta carpeta alojará únicamente adaptadores concretos del módulo.

Estructura prevista:

```text
infrastructure/
  drive/          implementación de DocumentSourceReader
  ai/             implementación de AiProjectAnalyzer y generadores posteriores
  persistence/    implementación Drizzle de EstimationRepository
```

No deben importarse SDKs de Google/LLM desde `domain/` ni `application/`.
Los proveedores concretos se conectarán a través de los puertos definidos por
la capa de aplicación.
