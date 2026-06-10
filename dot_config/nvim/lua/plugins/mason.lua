-- Guarantee these Mason tools are installed on every machine on first launch,
-- independent of which extras are enabled. LazyVim's mason config iterates
-- opts.ensure_installed and installs anything missing. Edit this list to taste.
return {
  {
    "mason-org/mason.nvim",
    opts = {
      ensure_installed = {
        -- lua
        "lua-language-server",
        "stylua",
        -- shell
        "bash-language-server",
        "shfmt",
        "shellcheck",
        -- go
        "gopls",
        "gofumpt",
        "goimports",
        "golangci-lint",
        "delve",
        -- python
        "pyright",
        "ruff",
        "black",
        "debugpy",
        -- web / data
        "json-lsp",
        "yaml-language-server",
        "taplo",
        "prettier",
        "sqlfluff",
        -- docker
        "dockerfile-language-server",
        "docker-compose-language-service",
        "hadolint",
        -- markdown
        "marksman",
        "markdownlint-cli2",
        "markdown-toc",
        -- debug
        "codelldb",
      },
    },
  },
}
