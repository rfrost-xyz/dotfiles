" Check for and install Coc definitions
let g:coc_global_extensions = [
\ 'coc-prettier',
\ 'coc-html',
\ 'coc-css',
\ 'coc-pairs',
\ 'coc-highlight',
\ 'coc-snippets',
\ 'coc-json',
\ 'coc-xml'
\ ]

call plug#begin('~/.config/nvim/plugged')

" Theme
Plug 'dracula/vim', { 'as': 'dracula' }
Plug 'vim-airline/vim-airline'
Plug 'vim-airline/vim-airline-themes'

" Smooth scroll
Plug 'psliwka/vim-smoothie'

" Syntax
Plug 'PProvost/vim-ps1' " Powershell
Plug 'plasticboy/vim-markdown' " Markdown
Plug 'bronson/vim-trailing-whitespace' " Highlight whitespace

" Todo
Plug 'vitalk/vim-simple-todo'

" Highlight
Plug 'markonm/traces.vim'

" Completion
Plug 'neoclide/coc.nvim', {'do': 'yarn install --frozen-lockfile'} " Coc

" Prettier, currently running through Coc
" Plug 'prettier/vim-prettier', { 'do': 'yarn install' } " Prettier

" Markdown preview
Plug 'iamcco/markdown-preview.nvim', { 'do': { -> mkdp#util#install() }, 'for': ['markdown', 'vim-plug']}

" Git
Plug 'tpope/vim-fugitive'

" Icons, always load last
" Plug 'ryanoasis/vim-devicons'
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""                                                           
call plug#end()
