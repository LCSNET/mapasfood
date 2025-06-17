document.addEventListener('DOMContentLoaded', () => {
    // A URL da API é deixada em branco para fazer requisições ao mesmo domínio que serve a página.
    const API_URL = '';

    // --- Referências aos elementos do DOM ---
    const menuContainer = document.getElementById('menu-container');
    const listaCarrinhoModal = document.getElementById('lista-carrinho-modal');
    const totalModalElement = document.getElementById('total-modal');
    const cartCountElement = document.getElementById('cart-count');
    const verCarrinhoBtn = document.getElementById('ver-carrinho-btn');
    const checkoutModal = document.getElementById('checkout-modal');
    const fecharModalBtn = document.getElementById('fechar-modal-btn');
    const formFinalizar = document.getElementById('form-finalizar');
    const pagamentoSelect = document.getElementById('pagamento');
    const campoTrocoDiv = document.getElementById('campo-troco');
    const currentYearElement = document.getElementById('currentYear');
    const toastNotificationElement = document.getElementById('toast-notification');
    
    // --- Estado da Aplicação (dados que mudam) ---
    let carrinho = [];
    let produtosDisponiveis = [];

    // --- NOVAS FUNÇÕES DE PERSISTÊNCIA DO CARRINHO ---

    /**
     * Salva o estado atual do carrinho no localStorage do navegador.
     */
    function salvarCarrinhoNoLocalStorage() {
        localStorage.setItem('carrinhoPizzaria', JSON.stringify(carrinho));
    }

    /**
     * Carrega o carrinho salvo do localStorage ao iniciar a página.
     */
    function carregarCarrinhoDoLocalStorage() {
        const carrinhoSalvo = localStorage.getItem('carrinhoPizzaria');
        if (carrinhoSalvo) {
            carrinho = JSON.parse(carrinhoSalvo);
            atualizarCarrinhoDisplay();
        }
    }

    // --- Funções Principais ---

    async function carregarCardapio() {
        try {
            const [categoriasRes, produtosRes] = await Promise.all([ 
                fetch(`${API_URL}/api/menu/categorias`), 
                fetch(`${API_URL}/api/menu/produtos`) 
            ]);
            if (!categoriasRes.ok || !produtosRes.ok) {
                throw new Error('Não foi possível carregar o cardápio.');
            }
            const categorias = await categoriasRes.json();
            produtosDisponiveis = await produtosRes.json();
            renderizarCardapio(categorias, produtosDisponiveis);
        } catch (error) {
            menuContainer.innerHTML = `<p class="text-red-500 text-center">${error.message}</p>`;
        }
    }

    function renderizarCardapio(categorias, produtos) {
        menuContainer.innerHTML = '';
        if (categorias.length === 0) {
            menuContainer.innerHTML = '<p class="text-gray-400 text-center">Nenhum item no cardápio no momento.</p>';
            return;
        }
        categorias.forEach(cat => {
            const produtosDaCategoria = produtos.filter(p => p.categoria_id === cat.id);
            if (produtosDaCategoria.length > 0) {
                const produtosHTML = produtosDaCategoria.map(criarCardProduto).join('');
                menuContainer.innerHTML += `
                    <section class="mb-16">
                        <h2 class="font-playfair text-4xl font-bold text-center mb-10 text-yellow-500">${cat.nome}</h2>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">${produtosHTML}</div>
                    </section>`;
            }
        });
    }

    function criarCardProduto(produto) {
        let priceOrSelectHTML;
        if (produto.variacoes.length > 1) {
            const options = produto.variacoes.map(v => `<option value="${v.id}">${v.nome} - R$ ${v.preco.toFixed(2)}</option>`).join('');
            priceOrSelectHTML = `<select class="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white variacao-select">${options}</select>`;
        } else if (produto.variacoes.length === 1) {
            priceOrSelectHTML = `<span class="text-xl font-bold text-green-400">R$ ${produto.variacoes[0].preco.toFixed(2)}</span>`;
        } else {
             priceOrSelectHTML = `<span class="text-base font-bold text-red-400">Indisponível</span>`;
        }
        return `
            <div class="product-card flex flex-col card" data-produto-id="${produto.id}">
                <div class="overflow-hidden h-56 rounded-t-lg"><img src="${produto.imagem || 'https://placehold.co/600x400/1f2937/f3f4f6?text=Sem+Imagem'}" alt="${produto.nome}" class="w-full h-full object-cover"></div>
                <div class="p-5 flex flex-col flex-grow">
                    <h3 class="font-playfair text-2xl font-bold text-yellow-400">${produto.nome}</h3>
                    <p class="text-sm text-gray-400 my-2 flex-grow">${produto.descricao}</p>
                    <div class="flex justify-between items-center mt-4">
                        ${priceOrSelectHTML}
                        <button class="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold py-2 px-4 rounded-lg add-item-btn ml-4" ${produto.variacoes.length === 0 ? 'disabled' : ''}><i class="fas fa-cart-plus"></i></button>
                    </div>
                </div>
            </div>`;
    }

    function atualizarCarrinhoDisplay() {
        const total = carrinho.reduce((acc, item) => acc + item.preco, 0);
        
        if (carrinho.length === 0) {
            listaCarrinhoModal.innerHTML = '<p class="text-gray-400 text-center">Seu carrinho está vazio.</p>';
        } else {
            listaCarrinhoModal.innerHTML = carrinho.map((item, index) => `
                <li class="flex justify-between items-center p-3 bg-gray-900 rounded-md">
                    <span class="flex-1">${item.nome}</span>
                    <div class="flex items-center">
                        <span class="mr-4 font-semibold">R$ ${item.preco.toFixed(2)}</span>
                        <button class="text-red-500 hover:text-red-400 remover-item-btn" data-index="${index}"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </li>`).join('');
        }
        
        totalModalElement.textContent = total.toFixed(2);
        cartCountElement.textContent = carrinho.length;
        cartCountElement.classList.toggle('hidden', carrinho.length === 0);
        // Salva o carrinho a cada atualização
        salvarCarrinhoNoLocalStorage();
    }
    
    function showToast(message, isError = false) {
        const toast = document.getElementById('toast-notification');
        toast.textContent = message;
        toast.className = `toast show ${isError ? 'bg-red-600' : 'bg-green-600'}`;
        setTimeout(() => toast.classList.remove("show"), 3000);
    }

    // --- Event Listeners (interações do usuário) ---

    menuContainer.addEventListener('click', (e) => {
        const addButton = e.target.closest('.add-item-btn');
        if (addButton) {
            const card = addButton.closest('.product-card');
            const produto = produtosDisponiveis.find(p => p.id == card.dataset.produtoId);
            const select = card.querySelector('.variacao-select');
            const variacao = produto.variacoes.find(v => v.id == (select ? select.value : produto.variacoes[0].id));
            carrinho.push({ nome: `${produto.nome} (${variacao.nome})`, preco: variacao.preco });
            showToast(`${produto.nome} adicionado!`);
            atualizarCarrinhoDisplay();
        }
    });

    listaCarrinhoModal.addEventListener('click', e => {
        const removeButton = e.target.closest('.remover-item-btn');
        if(removeButton) {
            carrinho.splice(parseInt(removeButton.dataset.index), 1);
            atualizarCarrinhoDisplay();
        }
    });
    
    verCarrinhoBtn.addEventListener("click", () => {
        if (carrinho.length === 0) {
            showToast("Seu carrinho está vazio!", true);
            return;
        }
        checkoutModal.classList.remove("hidden");
        atualizarCarrinhoDisplay();
    });
    
    fecharModalBtn.addEventListener("click", () => checkoutModal.classList.add("hidden"));
    pagamentoSelect.addEventListener('change', (e) => {
        campoTrocoDiv.classList.toggle('hidden', e.target.value !== 'Dinheiro');
    });

    formFinalizar.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nome = document.getElementById('nome').value;
        const endereco = document.getElementById('endereco').value;
        const referencia = document.getElementById('referencia').value;
        const pagamento = document.getElementById('pagamento').value;
        const observacoes = document.getElementById('observacoes').value;
        const trocoPara = document.getElementById('troco_para').value;
        
        const total = carrinho.reduce((acc, item) => acc + item.preco, 0);
        let detalhesDoPedido = carrinho.map(item => `- ${item.nome}`).join('\n');
        if (observacoes) detalhesDoPedido += `\n\n*Observações:* ${observacoes}`;
        
        const enderecoCompleto = referencia ? `${endereco} (Ref: ${referencia})` : endereco;
        const numeroWhatsAppDono = '5535999225307';
        
        try {
            const res = await fetch(`${API_URL}/api/pedidos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente_nome: nome,
                    cliente_whatsapp: 'Pedido via Site',
                    endereco: enderecoCompleto,
                    total,
                    detalhes: detalhesDoPedido,
                })
            });
            if (!res.ok) throw new Error('Falha ao registrar o pedido no sistema.');
        } catch (error) {
            showToast(error.message, true);
            return;
        }

        let mensagemWhatsApp = `*Novo Pedido do Site!* 🎉\n\n` +
            `*Cliente:* ${nome}\n` +
            `*Endereço:* ${endereco}\n`;
        if (referencia) mensagemWhatsApp += `*Referência:* ${referencia}\n`;
        mensagemWhatsApp += `*Pagamento:* ${pagamento}\n`;
        if (pagamento === 'Dinheiro' && trocoPara) mensagemWhatsApp += `*Troco para:* R$ ${trocoPara}\n`;
        if (observacoes) mensagemWhatsApp += `*Observações:* ${observacoes}\n`;
        mensagemWhatsApp += `\n*Itens:*\n${carrinho.map(item => `- ${item.nome}`).join('\n')}\n\n*Total: R$ ${total.toFixed(2)}*`;
        
        window.open(`https://wa.me/${numeroWhatsAppDono}?text=${encodeURIComponent(mensagemWhatsApp)}`, '_blank');
        
        showToast('Pedido enviado com sucesso!');
        carrinho = [];
        formFinalizar.reset();
        checkoutModal.classList.add('hidden');
        atualizarCarrinhoDisplay();
    });
    
    // --- Inicialização ---
    if(document.getElementById('currentYear')) {
        document.getElementById('currentYear').textContent = new Date().getFullYear();
    }
    carregarCarrinhoDoLocalStorage();
    carregarCardapio();
});