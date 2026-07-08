-- Headless (omaterm) only — chezmoi ignores this on the desktop role.
--
-- The desktop-role `theme-set` hook scp's the active omarchy theme's neovim
-- spec into this box's theme.lua on every `omarchy theme set`. LazyVim loads
-- that file at startup, but omaterm's nvim is long-lived (the shell auto-
-- attaches tmux), so "next launch" may never come. Watch theme.lua and
-- live-apply the colorscheme the moment the hook rewrites it — so a running
-- nvim tracks the desktop theme without a restart.
local theme_file = vim.fn.stdpath("config") .. "/lua/plugins/theme.lua"
local plugins_dir = vim.fn.stdpath("config") .. "/lua/plugins"
local transparency = vim.fn.stdpath("config") .. "/plugin/after/transparency.lua"

local function colorscheme_name()
  local ok, spec = pcall(dofile, theme_file)
  if not ok or type(spec) ~= "table" then
    return nil
  end
  for _, s in ipairs(spec) do
    if type(s) == "table" and s.opts and s.opts.colorscheme then
      return s.opts.colorscheme
    end
  end
  return nil
end

local function apply()
  local name = colorscheme_name()
  if not name then
    return
  end
  vim.cmd("highlight clear")
  if vim.fn.exists("syntax_on") == 1 then
    vim.cmd("syntax reset")
  end
  vim.o.background = "dark"
  -- Ensure the colorscheme's plugin is loaded before applying it.
  pcall(function()
    require("lazy.core.loader").colorscheme(name)
  end)
  pcall(vim.cmd.colorscheme, name)
  -- Re-assert transparency overrides on top of the new scheme.
  if vim.fn.filereadable(transparency) == 1 then
    pcall(vim.cmd.source, transparency)
  end
  vim.cmd("redraw!")
end

local function start_watch()
  local handle = vim.uv.new_fs_event()
  if not handle then
    return
  end
  -- Watch the directory (not the file): scp replaces theme.lua, which would
  -- drop a file-level watch; a directory watch survives the replacement.
  handle:start(
    plugins_dir,
    {},
    vim.schedule_wrap(function(err, filename)
      if err or filename ~= "theme.lua" then
        return
      end
      apply()
    end)
  )
end

return {
  {
    "LazyVim/LazyVim",
    init = function()
      vim.api.nvim_create_autocmd("VimEnter", {
        group = vim.api.nvim_create_augroup("omaterm_theme_watch", { clear = true }),
        callback = start_watch,
      })
    end,
  },
}
