#!/usr/bin/env bash
# PostToolUse hook for Edit|Write: lint the file that was just changed.
# Exit 2 sends the lint errors back to Claude so it fixes them immediately.
set -u

input=$(cat)
file=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)

if [ -z "$file" ] || [ ! -f "$file" ]; then
  exit 0
fi

case "$file" in
  *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs)
    # Ensure a `node` binary is on PATH — hooks run with a bare environment that
    # doesn't source the user's shell profile (nvm) or include ~/.local/bin, so
    # eslint's `#!/usr/bin/env node` shebang would otherwise fail to resolve.
    if ! command -v node >/dev/null 2>&1; then
      for cand in "$HOME/.local/bin" "${NVM_DIR:-}"/versions/node/*/bin "$HOME"/.nvm/versions/node/*/bin; do
        if [ -x "$cand/node" ]; then
          PATH="$cand:$PATH"
          break
        fi
      done
    fi
    if ! command -v node >/dev/null 2>&1; then
      echo "post-edit-lint: no 'node' on PATH; skipping eslint for $file" >&2
      exit 0
    fi
    # Walk up to the nearest package.json so the project's own eslint config is used.
    dir=$(dirname "$file")
    while [ "$dir" != "/" ]; do
      if [ -f "$dir/package.json" ]; then
        if [ -f "$dir/node_modules/.bin/eslint" ]; then
          if ! out=$(cd "$dir" && node ./node_modules/.bin/eslint "$file" 2>&1); then
            echo "eslint reported problems in $file — fix them:" >&2
            echo "$out" >&2
            exit 2
          fi
        fi
        break
      fi
      dir=$(dirname "$dir")
    done
    ;;
  *.py)
    if command -v ruff >/dev/null 2>&1; then
      if ! out=$(ruff check "$file" 2>&1); then
        echo "ruff reported problems in $file — fix them:" >&2
        echo "$out" >&2
        exit 2
      fi
      if ! out=$(ruff format --check "$file" 2>&1); then
        echo "$file is not ruff-formatted — run: ruff format \"$file\"" >&2
        echo "$out" >&2
        exit 2
      fi
    fi
    ;;
esac

exit 0
