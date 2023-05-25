local overrides = require("custom.configs.overrides")

---@type NvPluginSpec[]
local plugins = {

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
    dependencies = {
      -- github copilot cmp
      {
        "zbirenbaum/copilot-cmp",
        config = function ()
          require("copilot_cmp").setup()
        end
      },
    },
    cmd = "Copilot",
    event = "InsertEnter",
    opts = overrides.copilot,
  },

--  {
--    'stevearc/aerial.nvim',
--    opts = {},
--    -- Optional dependencies
--    dependencies = {
--      "nvim-treesitter/nvim-treesitter",
--      "nvim-tree/nvim-web-devicons"
--    },
--    lazy = false,
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
