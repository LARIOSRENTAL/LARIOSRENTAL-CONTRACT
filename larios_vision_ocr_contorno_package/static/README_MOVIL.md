# Larios Rental Contrato - App movil/tablet

Esta version no usa Python ni instaladores. Es una app web/PWA pensada para abrirse desde Safari, Chrome, iPad o tablet Android.

## Como se usa en movil/tablet

1. Sube toda esta carpeta a una URL web con HTTPS.
2. Abre esa URL desde el movil o tablet.
3. En iPhone/iPad: pulsa Compartir y elige `Añadir a pantalla de inicio`.
4. En Android/Chrome: pulsa `Instalar` o `Añadir a pantalla de inicio`.
5. Abre la app, rellena/revisa los campos y pulsa `Generar contrato PDF`.

## Que funciona ahora

- Formulario adaptado a movil y tablet.
- Fotos desde camara o galeria como referencia.
- Fecha y hora de entrega automaticas.
- Generacion del contrato PDF en el navegador.
- Todos los campos principales visibles antes de generar el PDF.
- Conductor principal y conductor adicional.
- Matricula, modelo, combustible y datos del vehiculo.
- Categoria del vehiculo solo dentro de la app, sin imprimirse en el PDF.
- Precio de alquiler automatico por categoria y dias segun tarifa.
- Franquicia automatica por categoria.
- Seguro completo con selector SI/NO; si se marca SI, calcula el precio y deja la franquicia a 0,00.
- Los precios calculados se pueden corregir manualmente antes de generar el PDF.
- Fecha, hora y lugar de devolucion se rellenan automaticamente desde la entrega y los dias de alquiler.
- Salida, devolucion, liquidacion, observaciones, documentacion y entrega/recogida.
- Marcado tactil de danos del vehiculo sobre el esquema.
- Firma del cliente con dedo o Apple Pencil.
- Modo instalable PWA cuando esta publicado en HTTPS.

## Pendiente para OCR automatico real en movil

El OCR automatico en movil requiere una de estas dos opciones:

- Un servidor en la nube que reciba la foto y devuelva los datos leidos.
- Integrar OCR pesado en navegador, con peor rendimiento en moviles.

Esta version llama a `/api/ocr` al subir una foto. Si se sube solo a Netlify como web estatica, las fotos quedan como referencia porque no existe ese endpoint. Para rellenar carnet, DNI y vehiculo automaticamente en movil hay que abrir la app desde la version con servidor OCR.

## Prueba local en ordenador

Para probar antes de publicarla:

```bash
python3 -m http.server 8080
```

Luego abre:

```text
http://localhost:8080
```
