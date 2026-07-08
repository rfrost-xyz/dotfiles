-- Headless (omaterm) only — chezmoi ignores this file on the desktop role, so
-- the laptop keeps its omarchy-managed truecolor `theme.lua`.
--
-- On headless boxes there is no omarchy theme, so instead of a fixed truecolor
-- scheme we follow the connecting terminal's 16-colour ANSI palette (see
-- colors/omaterm-ansi.lua). That palette is re-themed live by omarchy, so nvim
-- tracks the desktop theme with no cross-machine sync.
return {
  {
    "LazyVim/LazyVim",
    opts = { colorscheme = "omaterm-ansi" },
    init = function()
      -- Keep truecolor off across any later ColorScheme event; a truecolor
      -- scheme loading would otherwise re-enable it and stop tracking.
      vim.o.termguicolors = false
      vim.api.nvim_create_autocmd("ColorScheme", {
        group = vim.api.nvim_create_augroup("omaterm_ansi_no_tgc", { clear = true }),
        callback = function()
          vim.o.termguicolors = false
        end,
      })
    end,
  },
}
