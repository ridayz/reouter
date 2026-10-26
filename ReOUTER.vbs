Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)

' cek node
On Error Resume Next
WshShell.Run "cmd /c node -v", 0, True
If Err.Number <> 0 Then
  MsgBox "Node.js belum terpasang." & vbCrLf & "Download di https://nodejs.org", 16, "ReOUTER"
  WScript.Quit
End If
On Error GoTo 0

' install kalau belum ada node_modules
If Not fso.FolderExists(root & "\node_modules") Then
  WshShell.Run "cmd /c cd /d """ & root & """ && npm install --no-audit --no-fund", 0, True
End If

' jalankan server (jika belum jalan)
Set http = CreateObject("MSXML2.XMLHTTP")
On Error Resume Next
http.open "GET", "http://127.0.0.1:9301/api/state", False
http.send
If Err.Number <> 0 Or http.Status <> 200 Then
  WshShell.Run "cmd /c cd /d """ & root & """ && node server\index.js", 0, False
  WScript.Sleep 2500
End If

' buka browser
WshShell.Run "http://127.0.0.1:9301", 1, False