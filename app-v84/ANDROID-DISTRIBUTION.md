# Larios Rental para Android

El workflow `.github/workflows/android-apk.yml` compila un APK de prueba cuando no hay credenciales de firma. El APK de prueba sirve para ensayar la instalación, pero no garantiza que la siguiente compilación pueda actualizarlo.

Para distribuir una versión que se pueda actualizar, crea **una única clave de firma** y guárdala de forma permanente y segura. Todas las versiones futuras deben usar la misma clave y el mismo identificador `com.lariosrental.management`. Si se pierde la clave, no se podrán instalar actualizaciones sobre la app ya distribuida.

## Primera configuración de firma

En una máquina de confianza con `keytool`, genera la clave:

```sh
keytool -genkeypair -v -keystore larios-release.jks -alias larios-release -keyalg RSA -keysize 3072 -validity 10000
```

Conserva `larios-release.jks`, el alias y las contraseñas en un gestor seguro. Haz una copia de respaldo fuera del repositorio. Codifica el archivo con `base64 -w 0 larios-release.jks` (Linux) o `base64 -i larios-release.jks` (macOS).

Configura estos cuatro secretos en **GitHub → LARIOSRENTAL/LARIOSRENTAL-CONTRACT → Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Contenido |
| --- | --- |
| `LR_ANDROID_KEYSTORE_BASE64` | Contenido Base64 del archivo `.jks` |
| `LR_ANDROID_STORE_PASSWORD` | Contraseña del almacén |
| `LR_ANDROID_KEY_ALIAS` | `larios-release` |
| `LR_ANDROID_KEY_PASSWORD` | Contraseña de la clave |

No guardes la clave ni las contraseñas en el repositorio. El workflow falla si solo se configura una parte de los secretos.

## Compilar e instalar

En **Actions → Build Android APK → Run workflow**, elige la rama `agent/mobile-v84`. Si los cuatro secretos están disponibles, se produce `larios-rental-android-firmado` con el APK de versión. Si todavía faltan todos, se produce `larios-rental-android-prueba`. Descarga el artefacto ZIP desde la ejecución terminada, descomprímelo y abre el APK en el móvil Android. Android puede pedir autorización para instalar APK de esa fuente.

El número de versión de Android aumenta en cada ejecución del workflow. Antes de distribuir la versión firmada, comprueba el login, la agenda, la creación de reservas, el escáner y la generación del contrato PDF en un dispositivo Android real. Si se instaló un APK de prueba previo con otra clave, habrá que desinstalarlo **una sola vez** antes de instalar el APK firmado; conserva cualquier dato local que importe antes de hacerlo.

Los artefactos de Actions caducan a los 90 días. Para un enlace permanente de distribución o Play Store hace falta publicar el APK o un AAB por un canal de versiones y mantener el control de la clave.
