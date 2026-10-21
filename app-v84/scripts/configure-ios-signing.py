"""Validate an Apple-issued Tap to Pay profile and configure only the app target."""
import datetime
import json
import os
from pathlib import Path
import plistlib
import re

root = Path(__file__).resolve().parents[1]
profile = plistlib.loads(Path(os.environ['LR_IOS_PROFILE_PLIST']).read_bytes())
team = os.environ['LR_IOS_TEAM_ID']
bundle = json.loads((root / 'capacitor.config.json').read_text())['appId']
entitlements = profile.get('Entitlements', {})
if profile.get('ExpirationDate', datetime.datetime.min) <= datetime.datetime.utcnow():
    raise SystemExit('Apple provisioning profile expired')
if entitlements.get('application-identifier') != team+'.'+bundle:
    raise SystemExit('Apple provisioning profile must belong to the Larios Rental bundle and team')
if entitlements.get('com.apple.developer.proximity-reader.payment.acceptance') is not True:
    raise SystemExit('Apple has not granted Tap to Pay in this provisioning profile')
method = os.environ.get('LR_IOS_EXPORT_METHOD', 'release-testing')
if method not in ['debugging', 'release-testing', 'app-store-connect']:
    raise SystemExit('Unsupported export method')
if method == 'debugging' and not entitlements.get('get-task-allow'):
    raise SystemExit('Development export requires an Apple development profile')
if method != 'debugging' and entitlements.get('get-task-allow'):
    raise SystemExit('Distribution requires an Apple distribution profile with Tap to Pay permission')
if method == 'release-testing' and not profile.get('ProvisionedDevices'):
    raise SystemExit('Register the employee iPhones and use an ad hoc profile for direct installation')
if method == 'app-store-connect' and profile.get('ProvisionedDevices'):
    raise SystemExit('App Store Connect export requires an App Store distribution profile')

def quote(s): return '"'+s.replace('\\', '\\\\').replace('"', '\\"')+'"'
certificate = os.environ['LR_IOS_CERTIFICATE_SHA1']
project = root / 'ios/App/App.xcodeproj/project.pbxproj'
s = project.read_text().replace('CODE_SIGN_STYLE = Automatic;', 'CODE_SIGN_STYLE = Manual;')
s = s.replace('INFOPLIST_FILE = App/Info.plist;', 'INFOPLIST_FILE = App/Info.plist;\n'+''.join('\t\t\t\t'+key+' = '+quote(value)+';\n' for key, value in {'DEVELOPMENT_TEAM':team,'PROVISIONING_PROFILE_SPECIFIER':profile['Name'],'CODE_SIGN_IDENTITY':certificate}.items()))
project.write_text(s)
options = {'method':method,'teamID':team,'signingStyle':'manual','signingCertificate':certificate,'provisioningProfiles':{bundle:profile['Name']},'manageAppVersionAndBuildNumber':False}
(root / 'build/ExportOptions.plist').write_bytes(plistlib.dumps(options))
print('Apple-issued Tap to Pay profile validated; app signing configured.')
