#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# OpenExpert — instalación local para Linux.
#
# Deja el sistema así:
#   ~/.local/bin/openexpert                          comando en PATH
#   ~/.local/bin/openexpert-desktop                  binario de la ventana (Tauri)
#   ~/.local/share/applications/openexpert.desktop   entrada de menú (rofi drun)
#   ~/.local/share/icons/hicolor/512x512/apps/openexpert.png
#
# Uso:
#   ./install.sh                 instala lo que falte, compila y publica
#   ./install.sh --skip-build    reutiliza lo ya compilado (rápido, idempotente)
#   ./install.sh --no-deps       no toca paquetes del sistema (sin sudo)
#   ./install.sh --no-path       no modifica los rc de tu shell
#   ./install.sh --reinstall     fuerza "npm ci" aunque exista node_modules
#   ./install.sh --rofi-fix      añade "drun" al modi de rofi si falta
#   ./install.sh --bundle        genera además .deb, .rpm y AppImage
#   ./install.sh --doctor        solo diagnóstico: no instala ni compila
#   ./install.sh -y              sin preguntas
#
# Repetible las veces que haga falta: cada paso comprueba antes de actuar.
#
# Alcance:
#   · Solo Linux (en macOS/Windows el script se detiene en la primera línea: no
#     existen ~/.local/bin, las entradas .desktop ni rofi). En WSL2 es Linux,
#     pero la ventana necesita WSLg.
#   · Dependencias automáticas: Arch (pacman), Debian/Ubuntu (apt),
#     Fedora/RHEL (dnf), openSUSE (zypper) y Alpine (apk). El resto de distros
#     (Void, Gentoo, NixOS…): instala tú las dependencias y el script sigue igual.
#   · Ejecutado de verdad en Arch (este repo). Las listas de paquetes de apt,
#     dnf, zypper y apk se validaron resolviéndolas e instalándolas en
#     contenedores (Debian 13, Fedora, openSUSE Leap 16, Alpine 3.24) con
#     pkg-config; la compilación completa solo se ha probado en Arch.

set -euo pipefail

# ── presentación ─────────────────────────────────────────────────────────────
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_B=$'\033[1m'; C_0=$'\033[0m'
else
  C_OK=; C_WARN=; C_ERR=; C_DIM=; C_B=; C_0=
fi

step() { printf '\n%s▸ %s%s\n' "$C_B" "$*" "$C_0"; }
ok()   { printf '  %s✓%s %s\n' "$C_OK" "$C_0" "$*"; }
info() { printf '  %s·%s %s\n' "$C_DIM" "$C_0" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_WARN" "$C_0" "$*" >&2; WARNINGS=$((WARNINGS + 1)); }
fail() { printf '  %s✗%s %s\n' "$C_ERR" "$C_0" "$*" >&2; FAILURES=$((FAILURES + 1)); }
die()  { printf '\n%serror:%s %s\n' "$C_ERR" "$C_0" "$*" >&2; exit 1; }

WARNINGS=0
FAILURES=0
trap 'printf "\n%serror:%s fallo en la línea %s (comando: %s)\n" "$C_ERR" "$C_0" "$LINENO" "$BASH_COMMAND" >&2' ERR

have() { command -v "$1" >/dev/null 2>&1; }
confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  [ -t 0 ] || return 0
  local reply
  read -r -p "  ¿$1? [S/n] " reply
  case "${reply:-s}" in [sSyY]*) return 0 ;; *) return 1 ;; esac
}

# ── argumentos ───────────────────────────────────────────────────────────────
SKIP_BUILD=0; DO_DEPS=1; DO_PATH=1; FORCE_INSTALL=0; ROFI_FIX=0; DOCTOR=0; ASSUME_YES=0; BUNDLE=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-deps)    DO_DEPS=0 ;;
    --no-path)    DO_PATH=0 ;;
    --reinstall)  FORCE_INSTALL=1 ;;
    --rofi-fix)   ROFI_FIX=1 ;;
    --bundle)     BUNDLE=1 ;;
    --doctor)     DOCTOR=1; SKIP_BUILD=1; DO_DEPS=0; DO_PATH=0 ;;
    -y|--yes)     ASSUME_YES=1 ;;
    -h|--help)
      cat <<'USAGE'
Uso: ./install.sh [opciones]

  (sin opciones)   instala lo que falte, compila y publica el comando
  --skip-build     reutiliza lo ya compilado (rápido, idempotente)
  --no-deps        no toca paquetes del sistema (sin sudo)
  --no-path        no modifica los rc de tu shell
  --reinstall      fuerza "npm ci" aunque exista node_modules
  --rofi-fix       añade "drun" al modi de rofi si falta
  --bundle         genera además .deb, .rpm y AppImage (descarga utilidades)
  --doctor         solo diagnóstico: no instala ni compila
  -y, --yes        sin preguntas
  -h, --help       esta ayuda
USAGE
      exit 0 ;;
    *) die "argumento no reconocido: $arg (usa --help)" ;;
  esac
done

[ "$(uname -s)" = "Linux" ] || die "este instalador es solo para Linux."

# ── entorno de referencia ────────────────────────────────────────────────────
HOME_DIR="${HOME:?HOME no está definido}"
BIN_DIR="$HOME_DIR/.local/bin"
APPS_DIR="$HOME_DIR/.local/share/applications"
ICON_DIR="$HOME_DIR/.local/share/icons/hicolor/512x512/apps"
HICOLOR_DIR="$HOME_DIR/.local/share/icons/hicolor"
LAUNCHER="$BIN_DIR/openexpert"
DESKTOP_FILE="$APPS_DIR/openexpert.desktop"
ICON_FILE="$ICON_DIR/openexpert.png"
DATA_DIR="$HOME_DIR/.openexpert"
XDG_CONFIG="${XDG_CONFIG_HOME:-$HOME_DIR/.config}"
ROFI_CONF="$XDG_CONFIG/rofi/config.rasi"

REPO="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$REPO/package.json" ] && [ -f "$REPO/scripts/install-desktop.mjs" ] \
  || die "no encuentro el repositorio de OpenExpert aquí ($REPO). Ejecuta ./install.sh desde la raíz del clon."

printf '%sOpenExpert%s — instalación local\n' "$C_B" "$C_0"
info "repo: $REPO"

# ── 1. herramientas base ─────────────────────────────────────────────────────
step "Requisitos base"

PM=""; PM_INSTALL=""; PM_PACKAGES=""; PM_PATTERN=""
if have pacman; then
  PM=pacman
  PM_INSTALL="pacman -S --needed --noconfirm"
  PM_PACKAGES="base-devel pkgconf nodejs npm rust webkit2gtk-4.1 libsoup3 gtk3 librsvg"
elif have apt-get; then
  PM=apt
  PM_INSTALL="apt-get install -y"
  # Ojo: en Debian/Ubuntu estables el nodejs del repo es <24 (Debian 13: node 20, npm 9),
  # así que no lo pedimos aquí; el script avisará de cómo instalar Node 24 (nvm/NodeSource).
  PM_PACKAGES="build-essential pkg-config libwebkit2gtk-4.1-dev libsoup-3.0-dev libgtk-3-dev librsvg2-dev libssl-dev"
elif have dnf; then
  PM=dnf
  PM_INSTALL="dnf install -y"
  PM_PACKAGES="@development-tools pkgconf-pkg-config webkit2gtk4.1-devel libsoup3-devel gtk3-devel librsvg2-devel openssl-devel rust cargo nodejs24 nodejs24-npm"
elif have zypper; then
  PM=zypper
  PM_INSTALL="zypper --non-interactive install"
  PM_PATTERN="zypper --non-interactive install -t pattern devel_basis"
  # Leap 16: el .pc de WebKitGTK 4.1 lo trae webkit2gtk3-devel; npm va aparte (npm24).
  PM_PACKAGES="pkg-config webkit2gtk3-devel libsoup-devel gtk3-devel librsvg-devel libopenssl-devel rust cargo nodejs24 npm24"
elif have apk; then
  PM=apk
  PM_INSTALL="apk add --no-cache"
  # Alpine 3.24: nodejs 24.18 + npm 11.12 en el repo principal (musl).
  PM_PACKAGES="build-base pkgconf linux-headers nodejs npm rust cargo webkit2gtk-4.1-dev gtk+3.0-dev libsoup3-dev librsvg-dev openssl-dev"
else
  warn "no reconozco el gestor de paquetes; si falta algo, instálalo a mano."
fi

# Node ≥ 24 y npm ≥ 11 (la versión de npm que trae el paquete de nodejs suele valer)
NODE_MAJOR=0; NPM_MAJOR=0
if have node; then NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"; fi
if have npm;  then NPM_MAJOR="$(npm -v 2>/dev/null | cut -d. -f1 || echo 0)"; fi
NODE_OK=1; [ "${NODE_MAJOR:-0}" -ge 24 ] 2>/dev/null || NODE_OK=0
NPM_OK=1;  [ "${NPM_MAJOR:-0}"  -ge 11 ] 2>/dev/null || NPM_OK=0

# Librerías de compilación de la ventana (WebKitGTK 4.1)
LIBS_OK=1
for lib in webkit2gtk-4.1 gtk+-3.0 libsoup-3.0; do
  if have pkg-config; then
    pkg-config --exists "$lib" || { LIBS_OK=0; info "falta la librería de desarrollo: $lib"; }
  else
    LIBS_OK=0
  fi
done

RUST_OK=1; { have rustc && have cargo; } || RUST_OK=0

report_tool() { # nombre, estado(0/1), cómo se llama el paquete ya listo
  if [ "$2" = 1 ]; then ok "$1"; else warn "$1 ausente o demasiado antiguo ($3)"; fi
}
report_tool "node v${NODE_MAJOR} (≥24)" "$NODE_OK" "nodejs"
report_tool "npm v${NPM_MAJOR} (≥11)" "$NPM_OK" "npm"
report_tool "rustc/cargo (compilar la ventana)" "$RUST_OK" "rust"
report_tool "webkit2gtk-4.1 + gtk3 + libsoup3" "$LIBS_OK" "webkit2gtk-4.1 libsoup3 gtk3 pkgconf"

MISSING_TOOLING=0
if [ "$NODE_OK" = 0 ] || [ "$RUST_OK" = 0 ] || [ "$LIBS_OK" = 0 ] || [ "$NPM_OK" = 0 ]; then
  MISSING_TOOLING=1
fi

if [ "$MISSING_TOOLING" = 1 ] && [ "$DO_DEPS" = 1 ] && [ -n "$PM_INSTALL" ]; then
  if confirm "instalo las dependencias que faltan con $PM (usa sudo)"; then
    SUDO=""
    if [ "$(id -u)" != 0 ]; then
      have sudo || die "necesito sudo para instalar paquetes; repite con --no-deps si ya los tienes"
      SUDO="sudo"
    fi
    step "Instalando dependencias del sistema ($PM)"
    if [ -n "$PM_PATTERN" ]; then
      info "$PM_PATTERN"
      # shellcheck disable=SC2086
      $SUDO $PM_PATTERN || warn "$PM devolvió un error al instalar el patrón; sigo y verifico después"
    fi
    info "$PM_INSTALL $PM_PACKAGES"
    # shellcheck disable=SC2086
    $SUDO $PM_INSTALL $PM_PACKAGES || warn "$PM devolvió un error; sigo y verifico después"
    hash -r
    if have pkg-config; then
      LIBS_OK=1
      for lib in webkit2gtk-4.1 gtk+-3.0 libsoup-3.0; do pkg-config --exists "$lib" || LIBS_OK=0; done
    fi
    have rustc && have cargo && RUST_OK=1 || true
    have node && NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')" && NODE_OK=1 || true
    have npm && NPM_MAJOR="$(npm -v | cut -d. -f1)" && NPM_OK=1 || true
  else
    warn "has dicho que no: sigo con lo que haya instalado"
  fi
fi

if [ "$NODE_OK" = 0 ]; then
  die "hace falta Node.js ≥24 y tienes v${NODE_MAJOR:-ninguno}.
       Los repos de Debian/Ubuntu estables no llegan a 24 (Debian 13 trae 20), así que instálalo aparte:
         · nvm:        https://github.com/nvm-sh/nvm  →  nvm install 24
         · o NodeSource / fnm / volta
         · Arch: pacman -S nodejs npm    · Fedora y openSUSE Leap 16 sí traen nodejs24 (+ npm24)
       Después vuelve a ejecutar ./install.sh"
fi
[ "$NPM_OK" = 1 ] || die "hace falta npm ≥11 (tienes v${NPM_MAJOR:-ninguno}). Actualiza: npm i -g npm@latest"

if [ "$SKIP_BUILD" = 0 ] && [ "$RUST_OK" = 0 ]; then
  die "falta el toolchain de Rust para compilar la ventana. Instálalo: curl https://sh.rustup.rs -sSf | sh
       (o usa ./install.sh --skip-build si ya tienes el binario compilado)"
fi
if [ "$SKIP_BUILD" = 0 ] && [ "$LIBS_OK" = 0 ]; then
  die "faltan las librerías de desarrollo de WebKitGTK 4.1 (webkit2gtk-4.1, gtk3, libsoup3)."
fi

# ── 2. dependencias de Node ──────────────────────────────────────────────────
# Un node_modules a medias (install interrumpido, --omit=dev, sync parcial) hace
# que "npx tauri" muera con "could not determine executable to run", así que no
# basta con que el directorio exista: comprobamos los binarios que se usan.
MISSING_DEPS=""
for f in node_modules/.package-lock.json node_modules/.bin/tauri node_modules/.bin/vite node_modules/.bin/tsup; do
  [ -e "$REPO/$f" ] || MISSING_DEPS="$MISSING_DEPS $f"
done

if [ "$SKIP_BUILD" = 0 ] && [ "$DOCTOR" = 0 ]; then
  step "Dependencias de Node"
  if [ -z "$MISSING_DEPS" ] && [ "$FORCE_INSTALL" = 0 ]; then
    ok "node_modules completo (usa --reinstall para forzar npm ci)"
  else
    [ -n "$MISSING_DEPS" ] && info "falta:$MISSING_DEPS"
    ( cd "$REPO" && npm ci ) || die "npm ci ha fallado (revisa la red y vuelve a intentarlo)"
    ok "npm ci completado"
  fi
elif [ "$DOCTOR" = 1 ] && [ -n "$MISSING_DEPS" ]; then
  fail "node_modules incompleto; falta:$MISSING_DEPS — ejecuta ./install.sh sin --skip-build (o npm ci)"
elif [ -n "$MISSING_DEPS" ]; then
  warn "node_modules incompleto; falta:$MISSING_DEPS (con --skip-build no se compila, así que no afecta)"
fi

# ── 3. compilación ───────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" = 0 ] && [ "$DOCTOR" = 0 ]; then
  step "Compilando (CLI, interfaz web y ventana Tauri)"
  info "la primera compilación de Rust puede tardar 5-15 min…"
  ( cd "$REPO" && npm run build --workspace @openexpert/opencore ) || die "falló la build del CLI (@openexpert/opencore)"
  ok "CLI OpenCore"
  ( cd "$REPO" && npm run build ) || die "falló la build de la interfaz web (vite)"
  ok "interfaz web (.output)"

  # Usamos el binario local, no "npx tauri": si node_modules está a medias, npx
  # responde "could not determine executable to run" y se pierde la causa real.
  TAURI_BIN="$REPO/node_modules/.bin/tauri"
  [ -x "$TAURI_BIN" ] || die "no existe $TAURI_BIN. Ejecuta: (cd $REPO && npm ci) y vuelve a intentarlo."
  ( cd "$REPO" && "$TAURI_BIN" build --no-bundle ) \
    || die "falló la build de la ventana (Tauri). Causas típicas: falta rustc/cargo o las librerías de webkit2gtk-4.1 (míralo con: npm run opencore:doctor) o falta el CLI en node_modules (reintenta con --reinstall)."
  ok "ventana de escritorio (--no-bundle: no genera .deb/.rpm/AppImage, no hacen falta)"

  if [ "$BUNDLE" = 1 ]; then
    step "Empaquetando (.deb, .rpm, AppImage)"
    info "la primera vez descarga utilidades de empaquetado (linuxdeploy)…"
    ( cd "$REPO" && "$TAURI_BIN" build --bundles deb,rpm,appimage ) \
      || warn "el empaquetado ha fallado; el lanzador de usuario ya funciona igual"
    BUNDLE_FILES="$(find "$REPO/src-tauri/target/release/bundle" -maxdepth 2 -type f \
      \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \) 2>/dev/null | sort)"
    if [ -n "$BUNDLE_FILES" ]; then
      printf '%s\n' "$BUNDLE_FILES" | while IFS= read -r f; do ok "$f"; done
      info "ojo: el paquete lanza solo la ventana; el servidor local debe estar en marcha (o usa el lanzador 'openexpert')"
    else
      warn "no se ha generado ningún paquete en src-tauri/target/release/bundle"
    fi
  fi
fi

if [ "$DOCTOR" = 0 ]; then
  DESKTOP_BIN="$REPO/src-tauri/target/release/openexpert-desktop"
  [ -x "$DESKTOP_BIN" ] || die "no existe el binario de la ventana ($DESKTOP_BIN). Ejecuta sin --skip-build."

  # ── 4. publicar el comando y la entrada de menú ────────────────────────────
  step "Publicando el comando y la entrada de menú"
  ( cd "$REPO" && node scripts/install-desktop.mjs --skip-build ) \
    || die "el instalador del repo (scripts/install-desktop.mjs) ha fallado"
  ok "scripts/install-desktop.mjs"

  # El lanzador lo genera el repo; si faltara, lo recreo con las rutas de ESTE clon.
  if [ ! -x "$LAUNCHER" ]; then
    mkdir -p "$BIN_DIR"
    NODE_BIN="$(command -v node)"
    # Escritura atómica: sobre un lanzador en ejecución, escribir encima da ETXTBSY.
    TMP_LAUNCHER="$LAUNCHER.new-$$"
    printf '#!/usr/bin/env bash\n# SPDX-License-Identifier: MIT\nexport OPENEXPERT_DESKTOP_REPO="%s"\nmkdir -p "$HOME/.openexpert" 2>/dev/null || true\ncd "%s" 2>/dev/null || true\nif [ -t 1 ]; then\n  exec "%s" "%s/packages/opencore/bin/opencore.js" desktop "$@"\nelse\n  exec "%s" "%s/packages/opencore/bin/opencore.js" desktop "$@" >>"$HOME/.openexpert/desktop.log" 2>&1\nfi\n' \
      "$REPO" "$REPO" "$NODE_BIN" "$REPO" "$NODE_BIN" "$REPO" > "$TMP_LAUNCHER"
    chmod 755 "$TMP_LAUNCHER"
    mv -f "$TMP_LAUNCHER" "$LAUNCHER"
    warn "he recreado el lanzador a mano"
  fi
  ok "lanzador: $LAUNCHER"

  # La entrada de menú debe apuntar al lanzador por ruta absoluta (rofi/systemd no usan tu PATH).
  mkdir -p "$APPS_DIR"
  SRC_DESKTOP="$REPO/src-tauri/OpenExpert.desktop"
  [ -f "$SRC_DESKTOP" ] || die "no encuentro $SRC_DESKTOP"
  sed -e "s|^Exec=.*|Exec=$LAUNCHER|" -e "s|^TryExec=.*|TryExec=$LAUNCHER|" \
      -e "s|^Icon=.*|Icon=openexpert|" "$SRC_DESKTOP" > "$DESKTOP_FILE"
  if ! grep -q '^TryExec=' "$DESKTOP_FILE"; then
    sed -i "\|^Exec=.*|a TryExec=$LAUNCHER" "$DESKTOP_FILE"
  fi
  chmod 644 "$DESKTOP_FILE"
  ok "entrada de menú: $DESKTOP_FILE"

  ICON_SRC="$REPO/public/icon-source.png"
  if [ -f "$ICON_SRC" ]; then
    mkdir -p "$ICON_DIR"
    cp -f "$ICON_SRC" "$ICON_FILE"
    chmod 644 "$ICON_FILE"
    ok "icono: $ICON_FILE"
  else
    warn "no encuentro $ICON_SRC (la entrada saldrá sin icono)"
  fi

  mkdir -p "$DATA_DIR"
fi

# ── 5. PATH en los rc del shell ──────────────────────────────────────────────
step "PATH del shell"
case ":$PATH:" in
  *":$BIN_DIR:"*) ok "$BIN_DIR está en el PATH de esta sesión" ;;
  *) warn "$BIN_DIR no está en el PATH de esta sesión (abre un shell nuevo al terminar)" ;;
esac

if [ "$DO_PATH" = 1 ] && [ "$DOCTOR" = 0 ]; then
  add_line() { # fichero, línea, marca
    local file="$1" line="$2" marker="$3"
    if [ -e "$file" ] && grep -qF "$marker" "$file" 2>/dev/null; then
      ok "$file ya lo tenía"
    else
      printf '\n# OpenExpert en el PATH\n%s\n' "$line" >> "$file"
      ok "$file actualizado"
    fi
  }

  for rc in "$HOME_DIR/.zshrc" "$HOME_DIR/.bashrc" "$HOME_DIR/.bash_profile"; do
    [ -e "$rc" ] || continue
    add_line "$rc" 'export PATH="$HOME/.local/bin:$PATH"' '.local/bin'
  done
  if [ -e "$XDG_CONFIG/fish/config.fish" ]; then
    add_line "$XDG_CONFIG/fish/config.fish" 'fish_add_path $HOME/.local/bin' 'local/bin'
  fi
  if [ ! -e "$HOME_DIR/.zshrc" ] && [ ! -e "$HOME_DIR/.bashrc" ] && [ ! -e "$HOME_DIR/.bash_profile" ]; then
    add_line "$HOME_DIR/.profile" 'export PATH="$HOME/.local/bin:$PATH"' '.local/bin'
  fi
fi

# ── 6. verificación (y rofi) ─────────────────────────────────────────────────
step "Verificación"

# 6.1 el comando existe y es ejecutable
if [ -x "$LAUNCHER" ]; then
  ok "comando: $LAUNCHER"
else
  fail "no existe el comando $LAUNCHER"
fi

# 6.2 el lanzador apunta a este clon (no a otro usuario/ruta)
if [ -f "$LAUNCHER" ]; then
  if grep -qF "\"$REPO\"" "$LAUNCHER"; then
    ok "el lanzador apunta a $REPO"
  else
    fail "el lanzador NO apunta a este clon; revisa $LAUNCHER"
  fi
fi

# 6.3 binario de la ventana donde el CLI lo busca
if [ -x "$BIN_DIR/openexpert-desktop" ]; then
  ok "ventana: $BIN_DIR/openexpert-desktop"
elif [ -x "$REPO/src-tauri/target/release/openexpert-desktop" ]; then
  warn "la ventana solo está en el repo (sin copiar a ~/.local/bin): ejecuta sin --skip-build"
else
  fail "no hay binario de ventana compilado"
fi

# 6.4 entrada de menú válida y ejecutable
if [ -f "$DESKTOP_FILE" ]; then
  if have desktop-file-validate; then
    VALIDATE_OUT="$(desktop-file-validate "$DESKTOP_FILE" 2>&1)" && VALIDATE_RC=0 || VALIDATE_RC=$?
    if [ "$VALIDATE_RC" = 0 ]; then
      ok "entrada .desktop válida"
      [ -n "$VALIDATE_OUT" ] && info "$VALIDATE_OUT"
    else
      fail "desktop-file-validate rechaza $DESKTOP_FILE"
      printf '%s\n' "$VALIDATE_OUT" >&2
    fi
  else
    ok "entrada .desktop presente (sin desktop-file-validate para validarla)"
  fi
  EXEC_PATH="$(sed -n 's/^Exec=\([^ ]*\).*/\1/p' "$DESKTOP_FILE" | head -1)"
  if [ -x "$EXEC_PATH" ]; then ok "Exec → $EXEC_PATH"; else fail "Exec apunta a algo que no existe: $EXEC_PATH"; fi
  TRY_PATH="$(sed -n 's/^TryExec=\(.*\)/\1/p' "$DESKTOP_FILE" | head -1)"
  if [ -n "$TRY_PATH" ] && [ ! -x "$TRY_PATH" ]; then
    fail "TryExec apunta a algo que no existe: $TRY_PATH (rofi ocultaría la entrada)"
  fi
else
  fail "no existe $DESKTOP_FILE"
fi

# 6.5 icono
if [ -f "$ICON_FILE" ]; then ok "icono: $ICON_FILE"; else warn "falta el icono $ICON_FILE"; fi

# 6.6 cachés de menú/iconos
if have update-desktop-database; then update-desktop-database "$APPS_DIR" 2>/dev/null && ok "caché de menús actualizada" || warn "update-desktop-database devolvió un error"; fi
if have gtk-update-icon-cache; then gtk-update-icon-cache -f -t "$HICOLOR_DIR" >/dev/null 2>&1 && ok "caché de iconos actualizada" || warn "gtk-update-icon-cache devolvió un error"; fi

# 6.7 rofi: drun lee ~/.local/share/applications y oculta entradas cuyo TryExec no exista
step "rofi"
if have rofi; then
  ok "rofi instalado ($(command -v rofi))"
  if [ -f "$ROFI_CONF" ]; then
    if grep -q 'drun' "$ROFI_CONF"; then
      ok "tu config ya incluye el modo drun ($ROFI_CONF)"
    elif [ "$ROFI_FIX" = 1 ]; then
      cp -f "$ROFI_CONF" "$ROFI_CONF.bak"
      if grep -qE '^[[:space:]]*modi[[:space:]]*:' "$ROFI_CONF"; then
        sed -i -E 's|^([[:space:]]*modi[[:space:]]*:[[:space:]]*)"([^"]*)"|\1"\2,drun"|' "$ROFI_CONF"
        ok "he añadido drun al modi (copia previa en $ROFI_CONF.bak)"
      else
        warn "no hay línea 'modi:' en $ROFI_CONF; añade a mano: modi: \"drun,run\";"
      fi
    else
      warn "tu config no lista el modo drun: añade modi: \"drun,run\"; a $ROFI_CONF (o usa --rofi-fix)"
    fi
  else
    ok "sin config propia: rofi usa drun por defecto"
  fi
  info "prueba: rofi -show drun   → busca \"OpenExpert\""
  if [ -n "${XDG_DATA_DIRS:-}" ] && ! printf '%s' "$XDG_DATA_DIRS" | grep -q "local/share"; then
    info "rofi incluye \$HOME/.local/share de serie; si no apareciera: XDG_DATA_DIRS=\"\$HOME/.local/share:\$XDG_DATA_DIRS\" rofi -show drun"
  fi
else
  warn "rofi no está instalado en esta máquina; la entrada .desktop queda lista para cualquier lanzador (rofi, wofi, fuzzel, menú de apps)"
fi

# ── resumen ──────────────────────────────────────────────────────────────────
printf '\n%s────────────────────────────────────────%s\n' "$C_DIM" "$C_0"
if [ "$FAILURES" -gt 0 ]; then
  printf '%sInstalación con %s problema(s) y %s aviso(s).%s\n' "$C_ERR" "$FAILURES" "$WARNINGS" "$C_0"
  exit 1
fi
printf '%s✓ Instalación completada%s' "$C_OK" "$C_0"
if [ "$WARNINGS" -gt 0 ]; then
  printf ' con %s aviso(s)' "$WARNINGS"
fi
printf '.\n\n'
cat <<EOF
  Comando   openexpert                     (ventana + servidor local en el puerto 3000)
  Ventana   openexpert-desktop
  Menú      $DESKTOP_FILE
  Datos     $DATA_DIR

  Si acabas de añadir ~/.local/bin al PATH, abre un terminal nuevo (o: exec \$SHELL -l).
  Si la ventana sale en blanco en Wayland: WEBKIT_DISABLE_DMABUF_RENDERER=1 openexpert
  Ojo: 'openexpert' siempre abre la ventana (el lanzador añade el subcomando desktop).
  Para los subcomandos del CLI sin ventana: cd $REPO && npm run opencore:doctor
EOF
