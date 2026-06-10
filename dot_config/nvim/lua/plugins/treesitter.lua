-- Treesitter parsers to always have installed, on top of what the lang extras
-- pull in. LazyVim list-extends opts.ensure_installed (nvim-treesitter main).
return {
  {
    "nvim-treesitter/nvim-treesitter",
    opts = {
      ensure_installed = {
        "go",
        "python",
        "rust",
        "lua",
        "bash",
        "json",
        "yaml",
        "toml",
        "xml",
        "sql",
        "dockerfile",
        "markdown",
        "markdown_inline",
        "gitattributes",
        "gitcommit",
        "git_config",
        "git_rebase",
        "gitignore",
        "usd",
        "regex",
        "diff",
      },
    },
  },
}
