local overrides = require("custom.configs.overrides")

---@type NvPluginSpec[]
local plugins = {

	-- Override plugin definition options
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      -- format & linting
      {
        "jose-elias-alvarez/null-ls.nvim",
        config = function()
          require "custom.configs.null-ls"
        end,
      },
    },
    config = function()
      require "plugins.configs.lspconfig"
      require "custom.configs.lspconfig"
    end, -- Override to setup mason-lspconfig
  },

  {
    "max397574/better-escape.nvim",
    event = "InsertEnter",
    config = function()
      require("better_escape").setup()
    end,
  },

  -- override plugin configs
  {
    "nvim-treesitter/nvim-treesitter",
    opts = overrides.treesitter,
  },

  {
    "williamboman/mason.nvim",
    opts = overrides.mason
  },

  {
    "nvim-tree/nvim-tree.lua",
    opts = overrides.nvimtree,
  },

  {
    "hrsh7th/nvim-cmp",
    opts = overrides.cmp,
  },

  -- vim table mode
  {
    "dhruvasagar/vim-table-mode",
      keys = {
        { "<leader>tm", "<cmd>Tablemode toggle<cr>", desc = "Table Mode" },
      },
  },

  -- github copilot
  {
    "zbirenbaum/copilot.lua",
    cmd = "Copilot",
    event = "InsertEnter",
    opts = overrides.copilot,
    dependencies = {
      -- github copilot cmp
      {
        "zbirenbaum/copilot-cmp",
        config = function ()
          require("copilot_cmp").setup()
        end
      },
    },
  },

--  {
--    'stevearc/aerial.nvim',
--    opts = {},
--    -- Optional dependencies
--    dependencies = {
--      "nvim-treesitter/nvim-treesitter",
--      "nvim-tree/nvim-web-devicons"
--    },
--    config = function()
--      require('aerial').setup({
--        -- optionally use on_attach to set keymaps when aerial has attached to a buffer
--        enable = true,
--        on_attach = function(bufnr)
--          -- Jump forwards/backwards with '{' and '}'
--          vim.keymap.set('n', '{', '<cmd>AerialPrev<CR>', {buffer = bufnr})
--          vim.keymap.set('n', '}', '<cmd>AerialNext<CR>', {buffer = bufnr})
--        end
--      })
--      end,
--  }

}

return plugins
