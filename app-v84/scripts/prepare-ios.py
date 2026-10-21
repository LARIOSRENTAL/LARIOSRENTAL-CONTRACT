"""Configure a freshly generated Capacitor CocoaPods project; safe to run twice."""
import os
import json
from pathlib import Path
import plistlib
import re
import shutil

root = Path(__file__).resolve().parents[1]
config = json.loads((root / 'capacitor.config.json').read_text())
app = root / 'ios/App/App'
if not app.is_dir():
    raise SystemExit('Create iOS first: npx cap add ios --packagemanager CocoaPods')
plist = app / 'Info.plist'
data = plistlib.loads(plist.read_bytes())
data.update({
    'CFBundleDevelopmentRegion': 'es',
    'CFBundleDisplayName': config['appName'],
    'NSLocationWhenInUseUsageDescription': 'Larios Rental necesita la ubicación para verificar y aceptar cobros presenciales con Stripe Terminal.',
    'NSCameraUsageDescription': 'Larios Rental usa la cámara para escanear documentos y registrar fotografías del alquiler.',
    'NSPhotoLibraryUsageDescription': 'Permite seleccionar fotografías y documentos del contrato.',
    'NSPhotoLibraryAddUsageDescription': 'Permite guardar imágenes relacionadas con el contrato.',
    'NSBluetoothAlwaysUsageDescription': 'Permite conectar lectores Stripe Terminal compatibles cuando sea necesario.',
    'ITSAppUsesNonExemptEncryption': False,
})
plist.write_bytes(plistlib.dumps(data, sort_keys=False))
# This declares the capability. Apple must grant it in the signing profile too.
(app / 'App.entitlements').write_bytes(plistlib.dumps({'com.apple.developer.proximity-reader.payment.acceptance': True}))
shutil.copyfile(root / 'native/ios/LariosBridgeViewController.swift', app / 'LariosBridgeViewController.swift')

storyboard = app / 'Base.lproj/Main.storyboard'
s = storyboard.read_text()
s = s.replace('customClass="CAPBridgeViewController" customModule="Capacitor"', 'customClass="LariosBridgeViewController" customModule="App"')
if 'customClass="LariosBridgeViewController"' not in s:
    raise SystemExit('Cannot configure native bridge in storyboard')
storyboard.write_text(s)

project = root / 'ios/App/App.xcodeproj/project.pbxproj'
s = project.read_text()
s = re.sub(r'PRODUCT_BUNDLE_IDENTIFIER = [^;]+;', 'PRODUCT_BUNDLE_IDENTIFIER = '+config['appId']+';', s)
if 'LariosBridgeViewController.swift in Sources' not in s:
    entries = [
        ('/* End PBXBuildFile section */', '\t\tAA2026102100000000000001 /* LariosBridgeViewController.swift in Sources */ = {isa = PBXBuildFile; fileRef = AA2026102100000000000002 /* LariosBridgeViewController.swift */; };\n'),
        ('/* End PBXFileReference section */', '\t\tAA2026102100000000000002 /* LariosBridgeViewController.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = LariosBridgeViewController.swift; sourceTree = "<group>"; };\n'),
    ]
    for marker, entry in entries:
        if s.count(marker) != 1: raise SystemExit('Unexpected Xcode project section')
        s = s.replace(marker, entry + marker)
    # Add to the app group and its Sources build phase, not the Pods target.
    s, count = re.subn(r'(\s+504EC3071FED79650016851F /\* AppDelegate.swift \*/,)', r'\1\n\t\t\t\tAA2026102100000000000002 /* LariosBridgeViewController.swift */,', s)
    if count != 1: raise SystemExit('Cannot locate Xcode app group')
    s, count = re.subn(r'(\s+504EC3081FED79650016851F /\* AppDelegate.swift in Sources \*/,)', r'\1\n\t\t\t\tAA2026102100000000000001 /* LariosBridgeViewController.swift in Sources */,', s)
    if count != 1: raise SystemExit('Cannot locate Xcode Sources phase')
if 'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;' not in s:
    s = s.replace('INFOPLIST_FILE = App/Info.plist;', 'INFOPLIST_FILE = App/Info.plist;\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;')
s = re.sub(r'IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;', 'IPHONEOS_DEPLOYMENT_TARGET = 18.0;', s)
s = re.sub(r'CURRENT_PROJECT_VERSION = \d+;', 'CURRENT_PROJECT_VERSION = '+str(int(os.environ.get('RUN_NUMBER', '1')))+';', s)
s = re.sub(r'MARKETING_VERSION = [0-9.]+;', 'MARKETING_VERSION = 8.4.0;', s)
project.write_text(s)
podfile = root / 'ios/App/Podfile'
s = podfile.read_text().replace("platform :ios, '15.0'", "platform :ios, '18.0'")
podfile.write_text(s)
print('iOS: Tap to Pay entitlement, native education, permissions and iOS 18 deployment configured. Apple signing still required.')
