return {
  {
    "iamcco/markdown-preview.nvim",
    init = function()
      vim.g.mkdp_filetypes = { "markdown" }

      -- CHANGE THIS LINE:
      -- Use explorer.exe. Windows knows what this is,
      -- and it will verify the URL and launch your default browser.
      vim.g.mkdp_browser = "explorer.exe"

      vim.g.mkdp_open_to_the_world = 1
    end,
  },
}
