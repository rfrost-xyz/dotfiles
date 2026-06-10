# A function to load and EXPORT environment variables from a file
# into the current shell session.
#
# Usage:
#   loadenv           # Smart-loads .env or the only .env file found
#   loadenv <file>    # Loads the specified file

function loadenv() {
  local all_env_files=()
  local file_count=0
  local env_file_to_load=""
  local f
  local user_argument="$1"
  local source_status=0

  # --- 1. Find Files ---
  mapfile -t all_env_files < <(fd --hidden --glob "*.env" --max-depth 1 2>/dev/null)
  file_count=${#all_env_files[@]}

  # --- 2. Decide Target File ---
  if [ -n "$user_argument" ]; then
    env_file_to_load="$user_argument"
  elif [ $file_count -eq 1 ]; then
    env_file_to_load="${all_env_files[0]}"
  else
    env_file_to_load=".env"
  fi

  # --- 3. Notify (if needed) ---
  if [ $file_count -gt 1 ]; then
    echo "Notice: Multiple .env files found:"
    for f in "${all_env_files[@]}"; do
      if [ "$f" == "$env_file_to_load" ]; then
        echo "  -> $f (target)"
      else
        echo "  - $f"
      fi
    done
    echo ""
  fi

  # --- 4. Load File ---
  set -a
  source "$env_file_to_load"
  source_status=$?
  set +a
  
  if [ $source_status -eq 0 ]; then
    echo "✔ Loaded environment variables from '$env_file_to_load'"
    return 0
  else
    echo "✘ Error while sourcing '$env_file_to_load'"
    return 1
  fi
}
