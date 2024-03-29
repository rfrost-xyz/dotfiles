local M = {}

M.treesitter = {
  ensure_installed = {
    "vim",
    "lua",
    "html",
    "css",
    "javascript",
    "typescript",
    "tsx",
		"json",
    "c",
		"usd",
		"dockerfile",
  },
  indent = {
    enable = true,
    -- disable = {
    --   "python"
    -- },
  },
	-- parser_install_dir = "C:/Users/richardf/AppData/Local/Programs/Neovim/lib/nvim/",
	highlight = { enable = true },
}

M.mason = {
  ensure_installed = {
    "lua-language-server",
    "stylua",
    "css-lsp",
    "html-lsp",
    "typescript-language-server",
    "deno",
		"json-lsp",
    "prettier",
    "clangd",
    "clang-format",
		"pyright",
		"dockerfile-language-server",
    "docker-compose-language-service",
  },
}

-- git support in nvimtree
M.nvimtree = {
  git = {
    enable = true,
  },

  renderer = {
    highlight_git = true,
    icons = {
      show = {
        git = true,
      },
    },
  },
}

M.copilot = {
  -- Possible configurable fields can be found on:
  -- https://github.com/zbirenbaum/copilot.lua#setup-and-configuration
  suggestion = {
   enabled = false
  },
  panel = {
    enabled = false
  },
}

M.cmp = {
  -- Override the default sources
  sources = {
    { name = "copilot" },
    { name = "nvim_lsp" },
    { name = "luasnip" },
    { name = "buffer" },
    { name = "nvim_lua" },
    { name = "path" },
  },
}

return M
