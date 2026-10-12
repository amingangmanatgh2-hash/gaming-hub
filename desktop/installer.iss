; ============================================================
;  تکاور ریسینگ — اسکریپت اینستالر ویندوز (Inno Setup)
;  یک setup.exe می‌سازد که بازی را کامل نصب می‌کند:
;  نصب در Program Files + میان‌بر منوی استارت + میان‌بر دسکتاپ.
;  خروجی: dist/takavar-setup.exe
; ============================================================
#define MyAppName "Takavar Racing"
#define MyAppVersion "6.0"
#define MyAppPublisher "Takavar"
#define MyAppExeName "Takavar Racing.exe"

[Setup]
AppId={{7C1F4A2E-9B3D-4E6A-8C5F-2D1A0B9E8F77}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=takavar-setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
SetupIconFile=icon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
