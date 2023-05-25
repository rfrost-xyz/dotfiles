local M = {}

M.treesitter = {
  ensure_installed = {
		-- defaults 
		"vim",
		"lua",

		-- web dev 
		"html",
		"css",
		"javascript",
		"typescript",
		"tsx",
		"json",

		-- low level
		"c",
  },
  indent = {
    enable = true,
    -- disable = {
    --   "python"
    -- },
  },
	parser_install_dir = "C:\\Users\\richardf\\source",
  --parser_install_dir = "C:/Users/richardf/source",
  highlight = { enable = true },
}

M.mason = {
  ensure_installed = {
    -- lua stuff
    "lua-language-server",
    "stylua",

    -- web dev stuff
    "css-lsp",
    "html-lsp",
    "typescript-language-server",
    "deno",
    "prettier",

    -- c/cpp stuff
    "clangd",
    "clang-format",
		
		-- python
		"pyright",

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
    auto_trigger = true,
  },
}
return M
