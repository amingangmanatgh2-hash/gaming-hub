[Setup]
AppId={{8F1C2A64-5B7E-4E2A-9C3D-15EEC1AACC10}
AppName=SPECIAL CLIENT
AppVersion=1.1.0
DefaultDirName={localappdata}\Programs\SPECIAL CLIENT
DefaultGroupName=SPECIAL CLIENT
PrivilegesRequired=lowest
MinVersion=10.0
LicenseFile=..\..\LICENSE
OutputDir=..\..\dist
OutputBaseFilename=SPECIAL_CLIENT_Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\SPECIAL_CLIENT.exe
SetupIconFile=..\..\launcher\special_client\assets\icon.ico

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Files]
Source: "..\..\dist\SPECIAL_CLIENT\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\docs\USER_DATA.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\SPECIAL CLIENT"; Filename: "{app}\SPECIAL_CLIENT.exe"
Name: "{group}\Uninstall SPECIAL CLIENT"; Filename: "{uninstallexe}"
Name: "{autodesktop}\SPECIAL CLIENT"; Filename: "{app}\SPECIAL_CLIENT.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\SPECIAL_CLIENT.exe"; Description: "Launch SPECIAL CLIENT"; Flags: nowait postinstall skipifsilent

; Uninstall deliberately preserves ALL launcher and Minecraft user data.
; Use CLI: SPECIAL_CLIENT_CLI.exe repair <version> for an explicit version repair.
