# Correcciones de integración Renthub

El historial conserva dos vías diferentes para el pago: la vía User API usa POST /api/auth/login y X-UserAuthToken; la vía Partner enviaba payment_method y payment_amount dentro de booking/insert. La prueba antigua observada en Renthub aparece como PREPAID. Esto no demuestra que la autenticación de User API hubiera funcionado entonces.

El catálogo real de la instalación confirma que B es el ID 6 y que el ID 1 es AM. La actualización mediante Partner Customer API v2 de citizenship, birth_country, id_issue_country, license_issue_country y license_type se comprobó con una lectura posterior. El parche incorpora estos campos y verifica los valores devueltos.

La nacionalidad se toma de los datos del cliente, separada del domicilio y del país de expedición del permiso. La licencia se envía con el valor confirmado del catálogo.

El cambio de pago queda separado del de Registry. Solo permite la prueba delimitada, bloquea la inserción cuando falla la lectura previa o no puede comprobarse que esté completa y exige una referencia explícita al modelo y a la reserva. Busca pagos sin limitarse al día actual. Una marca atómica impide inserciones concurrentes y reintentos después de un POST incierto. Un ID de respuesta no basta para confirmar un pago: debe verificarse el asiento, su relación, importe, método, fecha pagada y ausencia de PREPAID. No ejecuta acciones automáticas de facturación.

Las pruebas locales usan respuestas simuladas. Se comprobaron los países/nacionalidad, lectura incompleta, referencias ambiguas, PREPAID, concurrencia y reintentos inciertos. La sintaxis TypeScript pasa.

La función de producción no se ha actualizado. La autenticación User API continúa rechazada y el pago real de prueba no se ha insertado durante esta investigación. Los lectores temporales se han retirado. Antes de considerar resuelto el pago hay que obtener una lectura User API válida, comprobar la forma real de las respuestas, publicar el cambio autorizado y verificar la única inserción en Pagos/vencimientos.

Los primeros cambios de esta rama registran la versión de producción previa como base. Los cambios de Registry y pago están en commits separados y pueden revertirse de forma independiente.
