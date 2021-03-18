source ~/.config/nvim/plugconfig/plugins.vim
source ~/.config/nvim/plugconfig/vim-airline.vim
source ~/.config/nvim/plugconfig/markdown-preview.vim
source ~/.config/nvim/plugconfig/vimwiki.vim

syntax on
"colorscheme onedark
colorscheme dracula
" checks if terminal has 24-bit color support
if has("termguicolors")
    set termguicolors
endif

" layout
set number " line numbers
set scrolloff=7 " top/bottom spacing

" spelling
set spelllang=en_gb "spelling
autocmd BufRead,BufNewFile *.md setlocal spell " automatic spell check within markdown

" spacing
set wrap
set textwidth=79
set noexpandtab
set tabstop=4
set shiftwidth=4
set linebreak

" mappings
let mapleader = ","
" git
map <leader>c : Git commit -a<CR>
map <leader>p : Git push<CR>
" clear whitepsace
map <leader>w : %s/\s\+$//e <CR>

" netrw
" hide top banner, 'I' to toggle
let g:netrw_banner = 0

" syntax highlight
autocmd BufRead,BufNewFile *.md set filetype=markdown " markdown syntax

" terminal
set t_Co=256
set background=dark
