!ifndef BUILD_UNINSTALLER
  !ifdef ONE_CLICK
    !macroundef StartApp
    !macro StartApp
      Var /GLOBAL startAppArgs
      ${if} ${isUpdated}
        StrCpy $startAppArgs "--updated"
      ${else}
        StrCpy $startAppArgs ""
      ${endif}

      SetOutPath "$INSTDIR"
      ${If} ${UAC_IsAdmin}
        ; An explicitly elevated installer must still launch the app as the desktop user.
        ${StdUtils.ExecShellAsUser} $0 "$appExe" "open" "$startAppArgs"
        ${If} $0 != "ok"
        ${AndIf} $0 != "fallback"
          MessageBox MB_OK|MB_ICONEXCLAMATION "${PRODUCT_NAME} was installed, but could not be started automatically. Open it from the Start menu." /SD IDOK
        ${EndIf}
      ${Else}
        ; The per-user installer already has the right token. Avoid Explorer/COM, which can time out.
        ClearErrors
        Exec '"$appExe" $startAppArgs'
        ${If} ${Errors}
          MessageBox MB_OK|MB_ICONEXCLAMATION "${PRODUCT_NAME} was installed, but could not be started automatically. Open it from the Start menu." /SD IDOK
        ${EndIf}
      ${EndIf}
    !macroend
  !endif
!endif
