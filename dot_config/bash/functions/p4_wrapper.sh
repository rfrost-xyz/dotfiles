# A smart 'p4' wrapper function that logs in non-interactively.
# It automatically uses ~/.p4.env to obtain a ticket if needed.

function p4() {
  # 1. Check if we are already logged in. Use 'command p4' to prevent infinite recursion.
  if command p4 -ztag info 2>&1 | grep -q "error"; then
    # Perforce ticket invalid or expired. Attempting to log in...

    # 2. Need to log in. Load the .p4.env file.
    local p4_env_file="$HOME/.p4.env"
    
    if [ ! -f "$p4_env_file" ]; then
      echo "✘ Error: $p4_env_file not found."
      command p4 "$@"
      return 1
    fi

    # 3. Source the variables using the set -a trick
    set -a
    source "$p4_env_file"
    set +a

    # 4. Check if P4PASSWD was loaded
    if [ -z "$P4PASSWD" ]; then
      echo "✘ Error: $p4_env_file loaded, but P4PASSWD is not set."
      command p4 "$@"
      return 1
    fi

    # 5. Perform the non-interactive login
    # Use 'command p4' to prevent infinite recursion
    if ! echo "$P4PASSWD" | command p4 login 2>&1 | grep -q "logged in"; then
      echo "✘ Error: Automatic 'p4 login' failed. Check your password in $p4_env_file."
      return 1
    else
      echo "✔ Successfully logged in."
    fi
  fi

  # 6. Run the originally requested command
  command p4 "$@"
}
