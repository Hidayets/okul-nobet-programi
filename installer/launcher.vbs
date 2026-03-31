Option Explicit

Dim objShell, objFSO, strDir, http, bRunning

Set objShell = CreateObject("WScript.Shell")
Set objFSO   = CreateObject("Scripting.FileSystemObject")

' Launcher'ın bulunduğu klasör
strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Sunucu zaten çalışıyor mu kontrol et
bRunning = False
Set http = CreateObject("MSXML2.XMLHTTP")
On Error Resume Next
http.Open "GET", "http://localhost:3000", False
http.Send
If Err.Number = 0 Then
    If http.Status >= 200 And http.Status < 400 Then
        bRunning = True
    End If
End If
On Error GoTo 0
Set http = Nothing

' Sunucu çalışmıyorsa arka planda başlat (pencere göstermeden)
If Not bRunning Then
    objShell.Run Chr(34) & strDir & "\OkulNobet.exe" & Chr(34), 0, False
    WScript.Sleep 3000
End If

' Varsayılan tarayıcıda aç
objShell.Run "http://localhost:3000"

Set objFSO   = Nothing
Set objShell = Nothing
