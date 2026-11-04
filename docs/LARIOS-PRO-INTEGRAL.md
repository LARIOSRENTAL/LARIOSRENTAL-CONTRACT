# Larios Rental Pro integral — entorno independiente

Base estable: e7f4a55f07dec28cd0d7ff8dad9c030104c973d5 (04/11/2026), APK firmada 8.4.783.

## Estado real
Rama de desarrollo creada. Proyecto Supabase independiente PENDIENTE de elegir organización y confirmar coste. Este código no tiene credenciales de producción y no está publicado. No es todavía un entorno operativo.

## Separación obligatoria
- Proyecto Supabase distinto: Database, Auth, Storage, Edge Functions, copias y secretos propios.
- Dominio/origen web propio, nunca la ruta de producción; sesiones y cachés independientes.
- APK `com.lariosrental.management.testing`, rotulada PRUEBAS, instalable junto a producción.
- Datos sintéticos para pruebas; no copiar usuarios, credenciales, tarjetas, firmas ni documentos reales al entorno nuevo.
- Stripe en modo test, correo en buzón de pruebas, SES.HOSPEDAJES en simulación inicialmente. No copiar secretos de Renthub.
- Renthub, receptor WhatsApp, webhooks y tareas programadas reales desactivados. Su retirada de producción queda fuera de este arranque.
- No desplegar esta rama usando el workflow de producción ni compartir configuraciones o claves entre proyectos.

## Ruta de desarrollo
1. Reproducir funcionalidades actuales (agenda, clientes, contratos, flota, extras, precios, firmas, PDF y comisiones) en el proyecto separado. Validar navegador Safari y APK con datos sintéticos.
2. Gestión central de clientes y flota: documentos, historial, consentimientos, mantenimiento, disponibilidad y asignación sin solapamientos.
3. Facturación: emisor fiscal, series, conceptos, impuestos, cobros, PDF y rectificaciones, con revisión de los requisitos fiscales vigentes antes de activar emisión real.
4. Web pública: estudiar plataforma actual y API; conectar disponibilidad, precios y reservas. Mensajes autenticados, clave externa única, idempotencia, cola, reintentos y conciliación. No conectar el checkout de producción durante pruebas.
5. SES.HOSPEDAJES (interpretación pendiente de confirmar con el usuario): completar datos obligatorios, enviar tras contrato cuando esté listo, registrar respuesta/identificador y errores, reintentos sin duplicar. Confirmar credenciales, habilitación y requisitos oficiales antes de envío real.
6. Migración desde Renthub: inventario y correspondencias de clientes/vehículos/reservas, ensayo de importación, conciliación, revisión operativa y corte expresamente aprobado. Conservar trazabilidad de identificadores anteriores.

## Modelo de integración
Larios Rental Pro será autoridad de reservas, contratos, flota, clientes, comisiones y facturas. Web pública, Stripe y SES son adaptadores con bandeja de eventos y claves de idempotencia, no copias independientes de la reserva. Los contratos conservan la instantánea de datos utilizada al firmar y las correcciones quedan registradas.

## Criterios antes de sustituir Renthub
- Ensayo de un alquiler completo: reserva web/WhatsApp/manual, asignación, datos y firma, cobro/preautorización de prueba, contrato/PDF, comisión, factura, comunicación SES simulada, ampliación/cambio y devolución.
- Sin duplicados ante reenvíos, desconexiones o reintentos.
- No se pierde ningún campo al abrir pagos, cámara, tablet o volver al formulario.
- Agenda, escritura y firma fluidas en Safari iPhone/iPad y Android.
- Copia y restauración verificadas del nuevo proyecto.
- Comparación de reservas futuras, saldos, comisiones y documentos antes del corte.

## Pendiente de información
Organización del nuevo proyecto y aceptación de su coste; URL/plataforma de la web; confirmar SES.HOSPEDAJES como destino; datos fiscales y criterios de series; mecanismo autorizado de exportación desde Renthub.
