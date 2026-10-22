/**
 * Antecedente temporal para la PoC de Calculadora.
 *
 * Proviene del PDF "Requerimiento_KDM.pdf" entregado para validar el flujo
 * Drive -> Gemini -> estimación antes de disponer de credenciales reales de
 * Google Drive. Se presenta al frontend como un archivo PDF de una carpeta
 * virtual, pero Gemini recibe este texto extraído del documento original.
 *
 * El fallback se usa únicamente cuando Google Drive NO está configurado.
 */

export const FALLBACK_DRIVE_FOLDER_ID = 'kora-poc-fallback';
export const FALLBACK_DRIVE_FOLDER_URL =
  `https://drive.google.com/drive/folders/${FALLBACK_DRIVE_FOLDER_ID}`;

export const FALLBACK_DOCUMENT_ID = 'kora-poc-requerimiento-kdm';
export const FALLBACK_DOCUMENT_NAME = 'Requerimiento_KDM.pdf';
export const FALLBACK_DOCUMENT_MIME_TYPE = 'application/pdf';
export const FALLBACK_DOCUMENT_MODIFIED_AT =
  '2026-09-01T12:00:00.000Z';
export const FALLBACK_DOCUMENT_PATH =
  `Levantamiento/${FALLBACK_DOCUMENT_NAME}`;

export const FALLBACK_DOCUMENT_TEXT = String.raw`
DOCUMENTO DE REQUERIMIENTOS DETALLADOS
Aplicación de Recepción de Servicios e Integración SAP (KDM)

Proyecto: Plataforma de Recepción de Servicios KDM
Propósito: Especificaciones técnicas para Estimación de Desarrollo
Fecha de Creación: Septiembre de 2026
Destinatario: Equipo de Ingeniería y Desarrollo de Software

Este documento recopila de forma estructurada los requerimientos del sistema
solicitado por KDM para la gestión, revisión y aprobación de facturas de
proveedores de servicios integrando las plataformas Facele y SAP. Su propósito
es servir de base técnica y funcional para que el equipo de desarrollo realice
la estimación detallada del proyecto.

1. Contexto General y Arquitectura de la Solución

KDM requiere optimizar la validación de los servicios externos entregados por
sus proveedores. Se proyecta una plataforma digital que automatice y organice
la conformidad de los servicios y complemente los procesos automatizados (bots)
actualmente implementados en la empresa para recepciones físicas.

- Objetivo principal: desarrollar una aplicación móvil y de escritorio destinada
  a gestionar de punta a punta el flujo de revisión, recepción conforme y
  aprobación final de facturas de proveedores de servicios.
- Plataforma y Acceso: Aplicación Web Progresiva (PWA) o aplicación web,
  accesible mediante una URL única desde dispositivos móviles o computadores.
- Conectividad: operación 100% en línea; no se requiere modo offline.
- Volumen de Usuarios: promedio de 20 a 25 usuarios recurrentes, escalable hasta
  100 usuarios registrados.

2. Requerimientos de Seguridad y Autenticación

El control de accesos es crítico debido a que el sistema interactuará de manera
transaccional con Facele y SAP.

- Autenticación estándar mediante credenciales locales y encriptación robusta
  de contraseñas.
- Como alternativa cotizable opcional, Single Sign-On con Microsoft Entra ID
  para que una cuenta corporativa inhabilitada pierda acceso inmediatamente.

3. Portal de Administración (Backoffice Web)

El panel administrativo para contabilidad u operaciones debe considerar:

- Gestión de Usuarios: creación, edición, activación y baja.
- Asignación de Centros de Costo (CECO): uno o más CECO por usuario, delimitando
  las facturas y órdenes de compra de servicio que puede revisar.
- Gestión de Permisos: aprobación, rechazo o solo lectura.
- Mantenedor de Centros de Costo: mantenimiento de equivalencias y listados de
  CECO por sociedad.
- Panel de Control de Reglas Operativas (Feature Toggle): habilitar o deshabilitar
  temporalmente la regla de rechazo automático de 7 días y las acciones
  manuales de rechazo.

Para el Mantenedor de Equivalencias de Centros de Costo se plantean dos
alternativas:

A. Mantenedor Local (Backoffice App)
Pantalla de administración interna para cargar, editar y mantener manualmente
las equivalencias de CECO de todas las sociedades. Tiene menor esfuerzo técnico
inicial, pero requiere trabajo operativo manual para mantener la data alineada
con SAP.

B. Integración SAP (Sincronización API)
Conector que consuma una API expuesta por SAP para sincronizar periódica y
automáticamente la base de CECO vigentes. Evita intervención humana, pero
requiere mayor esfuerzo de desarrollo y pruebas de integración.

4. Requerimientos de Integración con APIs y Servicios Web

La arquitectura descansa sobre dos integraciones transaccionales robustas y
bidireccionales con Facele y SAP.

A. Integración con Facele (Web Service SOAP)

- Lectura: consumir Web Service SOAP para listar facturas de proveedores externos
  en estado de aprobación comercial pendiente.
- Atributos a extraer desde XML: Fecha de Emisión, Fecha de Vencimiento, RUT y
  Razón Social del Proveedor, Monto Total, Líneas de Detalle y Referencias,
  incluyendo número de Orden de Compra.
- Escritura: ante una aprobación o rechazo en la aplicación, llamar al Web
  Service de Facele para confirmar o rechazar comercialmente la factura.

B. Integración con SAP (API Gateway)

- Lectura: consulta en tiempo real de Órdenes de Compra de servicios abiertas,
  recuperando el Centro de Costo asociado a cada línea.
- Escritura transaccional: al confirmar la conformidad del servicio deben
  desencadenarse secuencialmente dos transacciones:
  1. Entrada de Mercancía de Servicio (Service Entry Sheet), creando la recepción
     de servicios en SAP a partir de la OC original.
  2. Contabilización de Factura, enviando a SAP las instrucciones para registrar
     la contabilización final asociada.

5. Lógica de Negocio y Motor de Coincidencias (Match Engine)

El sistema contará con un módulo inteligente de emparejamiento automático que
correrá periódicamente y correlacionará facturas de Facele con órdenes de compra
abiertas de SAP usando tres criterios obligatorios concurrentes:

1. RUT de proveedor coincidente.
2. Monto equivalente entre factura y monto pendiente/presupuestado de la OC.
3. Referencia técnica de la OC presente en el XML de la factura.

Una vez correlacionado un par Factura + OC, el registro se asigna solo a la
bandeja de usuarios cuyo CECO esté dentro de sus permisos de administración.

6. Flujo de Acciones de Usuario (Recepción de Servicios)

El operador, técnico, analista o jefe de área visualiza únicamente los
emparejamientos asociados a sus CECO.

Acción A: Confirmar Recepción del Servicio

- Gatilla aprobación comercial definitiva en Facele.
- Inserta la Entrada de Mercancía de Servicio en SAP.
- Ejecuta la contabilización de la factura en SAP.
- Envía correo genérico al proveedor informando aprobación e ingreso a
  contabilidad.

Acción B: Rechazar Recepción del Servicio

- Llama a Facele para rechazar comercialmente el documento.
- Envía correo genérico de rechazo al proveedor.

Acción C: Rechazo Automático por Inactividad

Si una factura emparejada permanece pendiente durante 7 días corridos sin
acción, el sistema ejecuta rechazo automático:

- invoca Facele indicando el rechazo;
- envía correo genérico de rechazo al proveedor;
- la regla de 7 días y el rechazo manual pueden ponerse en stand-by o apagarse
  globalmente mediante el Feature Toggle del panel de administración.

7. Notas para la Estimación del Desarrollo

- Arquitectura de Software: no se impone stack rígido; el equipo puede proponer
  tecnologías modernas y robustas para entregar una PWA responsiva y segura.
- Seguridad de Integraciones: por tratarse de integraciones bidireccionales
  críticas con SAP y Facele, deben considerarse buenas prácticas de
  ciberseguridad, cifrado de credenciales de API y auditoría de acciones de
  aprobación/rechazo.
- Simplificación Operativa: funcionamiento estrictamente online; quedan fuera
  bases locales offline, resolución de conflictos asíncronos y almacenamiento
  offline.
- Sugerencia de Sprints: Backend de Integraciones Facele/SAP, Motor de Match,
  Portal de Administración, Frontend Responsivo/PWA y opcional de SSO con
  Microsoft Entra ID.
`.trim();
