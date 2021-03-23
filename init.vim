" mappings
source ~/.config/nvim/plugconfig/plugins.vim
source ~/.config/nvim/plugconfig/coc.vim
source ~/.config/nvim/plugconfig/markdown-preview.vim
source ~/.config/nvim/plugconfig/vim-airline.vim
source ~/.config/nvim/plugconfig/vimwiki.vim

" colour
syntax on
colorscheme dracula
if has("termguicolors") " check for 24-bit color support
	set termguicolors
endif

" syntax highlight
autocmd BufRead,BufNewFile *.md set filetype=markdown

" layout
set number " line numbers
set scrolloff=3 " top/bottom scroll padding

" text wrap
set wrap
set linebreak

" spacing
set textwidth=79
set noexpandtab
set tabstop=4
set shiftwidth=4

" spelling
set spelllang=en_gb "spelling
autocmd BufRead,BufNewFile *.md setlocal spell " automatic spell check within markdown

" netrw
" hide top banner (I to toggle)
let g:netrw_banner = 0
" open new file to right
let g:netrw_altv=1

" terminal
set t_Co=256
set background=dark

" mappings
" leader
let mapleader = ","
" map <space> <leader>
" buffer
nmap <leader>1 : bp<CR>
nmap <leader>2 : bn<CR>
nmap <leader>3 : bd<CR>
" git
map <leader>gc : Git commit -a<CR>
map <leader>gp : Git push<CR>
" whitepsace clear
map <leader>w : %s/\s\+$//e <CR>
