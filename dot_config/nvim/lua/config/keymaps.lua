-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

local function chezmoi_add()
  local file = vim.fn.expand("%:p")
  vim.cmd("write")

  local source = vim.trim(vim.fn.system({ "chezmoi", "source-path", file }))
  local managed = vim.v.shell_error == 0

  if not managed then
    vim.fn.system({ "chezmoi", "add", file })
    vim.notify("chezmoi: added " .. file)
  elseif source:match("%.tmpl$") then
    vim.notify("chezmoi: template — launching 3-way merge", vim.log.levels.INFO)
    vim.cmd("tabnew | terminal chezmoi merge " .. vim.fn.shellescape(file))
  else
    vim.fn.system({ "chezmoi", "re-add", file })
    vim.notify("chezmoi: re-added " .. file)
  end
end

vim.api.nvim_create_user_command("ChezmoiAdd", chezmoi_add, {})
vim.keymap.set("n", "<leader>cz", chezmoi_add, { desc = "chezmoi add current file" })
