return {
  "obsidian-nvim/obsidian.nvim",
  version = "*", -- use latest release, remove to use latest commit
  ft = "markdown",
  enabled = function()
    return vim.fn.isdirectory(vim.fn.expand("~/Documents/Personal/")) == 1
      or vim.fn.isdirectory(vim.fn.expand("~/Documents/Digital Team/")) == 1
  end,
  ---@module 'obsidian'
  ---@type obsidian.config
  opts = {
    legacy_commands = false, -- this will be removed in the next major release
    workspaces = {
      {
        name = "personal",
        path = "~/Documents/Personal/",
      },
      {
        name = "work",
        path = "~/Documents/Digital Team/",
      },
    },
  },
}
