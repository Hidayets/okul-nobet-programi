; ─────────────────────────────────────────────────────────────────────────────
; Okul Nöbet Programı – Inno Setup Kurulum Betiği
; Derleme: ISCC.exe "installer\setup.iss"
; ─────────────────────────────────────────────────────────────────────────────

#define AppName      "Okul Nöbet Programı"
#define AppVersion   "1.0.0"
#define AppPublisher "Okul Yönetimi"
#define AppExeName   "OkulNobet.exe"
#define AppURL       "http://localhost:3000"
#define ReleaseDir   "..\release"

[Setup]
AppId={{B3A7C2F1-4D8E-4F2A-9B6C-1E5D7A3F8C2B}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
LicenseFile=
OutputDir={#ReleaseDir}
OutputBaseFilename=OkulNobetKurulum
SetupIconFile={#ReleaseDir}\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
CloseApplications=yes
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Tasks]
Name: "desktopicon";   Description: "Masaüstüne kısayol oluştur";   GroupDescription: "Ek görevler:"; Flags: unchecked
Name: "startmenuicon"; Description: "Başlat Menüsüne ekle";          GroupDescription: "Ek görevler:"

[Files]
; Ana çalıştırılabilir dosya (sunucu)
Source: "{#ReleaseDir}\OkulNobet.exe";          DestDir: "{app}"; Flags: ignoreversion

; Sessiz başlatıcı – konsol penceresi göstermeden sunucuyu başlatır ve tarayıcıyı açar
Source: "launcher.vbs";                          DestDir: "{app}"; Flags: ignoreversion

; Native SQLite binding (exe'nin yanında olması şart)
Source: "{#ReleaseDir}\better_sqlite3.node";    DestDir: "{app}"; Flags: ignoreversion

; React frontend dosyaları
Source: "{#ReleaseDir}\dist\*";                 DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs

; Uygulama ikonu
Source: "{#ReleaseDir}\icon.ico";               DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
; Başlat Menüsü – wscript.exe ile launcher.vbs çalıştırılır (CMD penceresi açılmaz)
Name: "{group}\{#AppName}";      Filename: "{sys}\wscript.exe"; Parameters: "//nologo ""{app}\launcher.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"; Tasks: startmenuicon
Name: "{group}\Programı Kaldır"; Filename: "{uninstallexe}"

; Masaüstü kısayolu
Name: "{autodesktop}\{#AppName}"; Filename: "{sys}\wscript.exe"; Parameters: "//nologo ""{app}\launcher.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Run]
; Kurulum sonrası başlat (sessiz – tarayıcı açılır)
Filename: "{sys}\wscript.exe"; Parameters: "//nologo ""{app}\launcher.vbs"""; WorkingDir: "{app}"; Description: "Okul Nöbet Programı'nı başlat"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Kaldırma sırasında program tarafından oluşturulan geçici dosyaları sil
Type: filesandordirs; Name: "{app}\logs"

[Code]
// Kurulum öncesi eski sürüm kontrolü
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
