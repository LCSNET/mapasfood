document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '';
    const socket = io(window.location.origin);
    let state = { categorias: [], produtos: [], entregadores: [], pedidos: [] };
    
    // --- Variáveis do Mapa OpenLayers ---
    let map;
    let vectorSource;
    let deliveryTrackers = {}; // Armazena os objetos de rastreamento (scooter, linha verde, etc.)

    const mapContainer = document.getElementById('map-container');
    
    /**
     * Inicializa o mapa OpenLayers se ainda não tiver sido inicializado.
     */
    function initializeMap() {
        if (!map && mapContainer) {
            const pizzariaCoords = document.body.dataset.pizzariaCoords.split(',').map(Number);
            const pizzariaLonLat = [pizzariaCoords[1], pizzariaCoords[0]]; // OpenLayers usa [lon, lat]

            // Camada de vetores para desenhar ícones e rotas
            vectorSource = new ol.source.Vector();
            const vectorLayer = new ol.layer.Vector({ source: vectorSource });

            map = new ol.Map({
                target: mapContainer,
                layers: [
                    new ol.layer.Tile({
                        source: new ol.source.OSM(),
                    }),
                    vectorLayer
                ],
                view: new ol.View({
                    center: ol.proj.fromLonLat(pizzariaLonLat),
                    zoom: 13,
                }),
            });
        }
    }
    
    // --- Lógica de Navegação ---
    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.view');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const viewId = `${e.currentTarget.dataset.view}-view`;
            views.forEach(v => v.classList.remove('active'));
            navLinks.forEach(l => l.classList.remove('active'));
            document.getElementById(viewId).classList.add('active');
            e.currentTarget.classList.add('active');
            if (viewId === 'entregadores-view') {
                initializeMap();
                // Força a atualização do tamanho do mapa quando a aba se torna visível
                setTimeout(() => { if (map) map.updateSize(); }, 10);
            }
        });
    });

    /**
     * Busca todos os dados da API e atualiza o estado da aplicação.
     */
    const fetchData = async () => {
        try {
            const [p, c, e, pd] = await Promise.all([
                fetch('/api/produtos'), fetch('/api/categorias'),
                fetch('/api/entregadores'), fetch('/api/pedidos')
            ]);
            state = { produtos: await p.json(), categorias: await c.json(), entregadores: await e.json(), pedidos: await pd.json() };
            render.all();
        } catch (e) { console.error("Falha ao buscar dados:", e); }
    };

    /**
     * Objeto com todas as funções de renderização.
     */
    const render = {
        all: () => { render.pedidos(); render.cardapioAdmin(); render.entregadores(); },
        pedidos: () => {
            const statuses = ['Novo', 'Em Preparo', 'Pronto', 'Em Rota', 'Entregue', 'Cancelado'];
            statuses.forEach(status => {
                const container = document.getElementById(`pedidos-${status.toLowerCase().replace(' ', '-')}`);
                if (container) {
                    const pedidosFiltrados = state.pedidos.filter(p => p.status === status);
                    container.innerHTML = pedidosFiltrados.length > 0 
                        ? pedidosFiltrados.map(criarCardPedido).join('') 
                        : '<p class="text-xs text-center text-gray-500 p-4">Nenhum pedido aqui.</p>';
                }
            });
        },
        cardapioAdmin: () => {
             const container = document.getElementById('cardapio-gerenciamento-container');
             container.innerHTML = state.categorias.map(cat => `
                <div class="card md:col-span-1">
                    <div class="flex justify-between items-center mb-3">
                      <h3 class="text-xl font-bold ${cat.status === 'pausado' ? 'text-gray-500 line-through' : ''}">${cat.nome}</h3>
                      <div class="flex items-center">
                        <button class="text-yellow-400 hover:text-yellow-300 mr-2 btn-pause-categoria" data-id="${cat.id}" data-status="${cat.status}" title="${cat.status === 'ativo' ? 'Pausar' : 'Reativar'}">${cat.status === 'ativo' ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>'}</button>
                        <button class="text-blue-400 hover:text-blue-300 mr-2 btn-edit-categoria" data-id="${cat.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="text-red-500 hover:text-red-400 btn-delete-categoria" data-id="${cat.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                      </div>
                    </div>
                    <div class="space-y-2">
                        ${state.produtos.filter(p => p.categoria_id === cat.id).map(p => `
                            <div class="flex items-center justify-between p-2 bg-gray-900 rounded-md">
                                <span class="truncate pr-2 ${p.status === 'pausado' ? 'text-gray-500 line-through' : ''}">${p.nome}</span>
                                <div class="flex-shrink-0">
                                    <button class="text-yellow-400 hover:text-yellow-300 mr-2 btn-pause-produto" data-id="${p.id}" data-status="${p.status}" title="${p.status === 'ativo' ? 'Pausar' : 'Reativar'}">${p.status === 'ativo' ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>'}</button>
                                    <button class="text-blue-400 hover:text-blue-300 mr-2 btn-edit-produto" data-id="${p.id}" title="Editar"><i class="fas fa-edit"></i></button>
                                    <button class="text-red-500 hover:text-red-400 btn-delete-produto" data-id="${p.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>`).join('') || '<p class="text-sm text-gray-500">Nenhum produto aqui.</p>'}
                    </div>
                </div>`).join('');
        },
        entregadores: () => {
            const container = document.getElementById('entregadores-lista');
            container.innerHTML = state.entregadores.map(e => `
                <div class="card p-4 flex justify-between items-start">
                    <div>
                        <p class="font-bold">${e.nome}</p>
                        <p class="text-sm text-yellow-400">ID: ${e.id}</p>
                        <p class="text-xs text-gray-400">${e.telefone}</p>
                    </div>
                    <div>
                        <button class="text-blue-400 hover:text-blue-300 mr-2 btn-edit-entregador" data-id="${e.id}"><i class="fas fa-edit"></i></button>
                        <button class="text-red-500 hover:text-red-400 btn-delete-entregador" data-id="${e.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`).join('') || '<p class="text-gray-400">Nenhum entregador.</p>';
        },
    };

    const modalContainer = document.getElementById('modal-container');
    const modals = {
        show: (content) => {
            modalContainer.innerHTML = `<div class="card w-full max-w-lg max-h-[90vh] overflow-y-auto">${content}</div>`;
            modalContainer.classList.remove('hidden');
        },
        close: () => modalContainer.classList.add('hidden'),
    };

    const showToast = (message, isError = false) => {
        const toast = document.createElement('div');
        toast.className = `toast ${isError ? 'bg-red-600' : 'bg-green-600'}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    function criarCardPedido(pedido) {
        const entregadoresOptions = state.entregadores.map(e => `<option value="${e.id}" ${pedido.entregador_id == e.id ? 'selected' : ''}>${e.nome}</option>`).join('');
        return `
            <div class="card p-4" id="pedido-${pedido.id}">
                <div class="flex justify-between items-start mb-2"><h3 class="text-lg font-bold">#${pedido.id}</h3><p class="text-sm text-gray-300">${pedido.cliente_nome}</p></div>
                 <p class="text-xs text-gray-400 mb-2">${pedido.endereco}</p>
                <div class="mb-3"><p class="font-semibold text-xs text-yellow-400">Itens:</p><ul class="list-disc list-inside text-gray-300 text-xs">${pedido.detalhes}</ul></div>
                <p class="text-right font-bold text-base text-green-400 mb-3">R$ ${pedido.total.toFixed(2)}</p>
                <div class="space-y-2">
                    <select class="entregador-select bg-gray-700 p-2 text-xs rounded-md w-full" data-id="${pedido.id}"><option value="">Atribuir Entregador</option>${entregadoresOptions}</select>
                    <select class="status-select bg-gray-700 p-2 text-xs rounded-md w-full" data-id="${pedido.id}">${['Novo', 'Em Preparo', 'Pronto', 'Em Rota', 'Entregue', 'Cancelado'].map(s => `<option value="${s}" ${pedido.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
                </div>
            </div>`;
    }

    const handleFormSubmit = async (url, method, body) => {
        try {
            const headers = body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
            const res = await fetch(url, { method, headers, body });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message);
            showToast(result.message);
            modals.close();
            fetchData();
        } catch (error) { showToast(error.message, true); }
    };
    
    document.body.addEventListener('click', async e => {
        const button = e.target.closest('button');
        if (!button) return;

        if (button.classList.contains('btn-cancel')) modals.close();
        if (button.id === 'btn-add-variacao') {
            const container = document.getElementById('variacoes-container');
            const newRow = document.createElement('div');
            newRow.className = 'flex gap-2 variacao-row';
            newRow.innerHTML = `<input type="text" placeholder="Nome" class="form-input w-2/3 variacao-nome" required><input type="number" step="0.01" placeholder="Preço" class="form-input w-1/3 variacao-preco" required><button type="button" class="text-red-500 btn-remove-variacao" title="Remover"><i class="fas fa-times"></i></button>`;
            container.appendChild(newRow);
        }
        if (button.classList.contains('btn-remove-variacao')) button.closest('.variacao-row').remove();
        
        if (button.id === 'btn-add-pedido') modals.show(`<h2 class="text-2xl font-bold mb-4">Novo Pedido Manual</h2><form id="form-pedido" class="space-y-4"><input type="text" name="cliente_nome" class="form-input" placeholder="Nome do Cliente" required><input type="text" name="cliente_whatsapp" class="form-input" placeholder="WhatsApp do Cliente" required><input type="text" name="endereco" class="form-input" placeholder="Endereço Completo" required><textarea name="detalhes" class="form-input" placeholder="Detalhes do Pedido (1 por linha)" required></textarea><input type="number" name="total" step="0.01" class="form-input" placeholder="Valor Total" required><div class="flex justify-end gap-4 pt-4"><button type="button" class="btn-cancel bg-gray-600 p-2 px-4 rounded">Cancelar</button><button type="submit" class="bg-green-600 p-2 px-4 rounded">Registrar</button></div></form>`);
        if (button.id === 'btn-add-categoria') modals.show(`<h2 class="text-2xl font-bold mb-4">Nova Categoria</h2><form id="form-categoria" class="space-y-4"><input type="text" name="nome" class="form-input" placeholder="Nome da Categoria" required><div class="flex justify-end gap-4 pt-4"><button type="button" class="btn-cancel bg-gray-600 p-2 px-4 rounded">Cancelar</button><button type="submit" class="bg-green-600 p-2 px-4 rounded">Salvar</button></div></form>`);
        if (button.id === 'btn-add-entregador') modals.show(`<h2 class="text-2xl font-bold mb-4">Novo Entregador</h2><form id="form-entregador" class="space-y-4"><input type="text" name="nome" class="form-input" placeholder="Nome do Entregador" required><input type="tel" name="telefone" class="form-input" placeholder="Telefone" required><div class="flex justify-end gap-4 pt-4"><button type="button" class="btn-cancel bg-gray-600 p-2 px-4 rounded">Cancelar</button><button type="submit" class="bg-green-600 p-2 px-4 rounded">Salvar</button></div></form>`);
        if (button.id === 'btn-add-produto') {
            const categoriasOptions = state.categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
            modals.show(`<h2 class="text-2xl font-bold mb-4">Novo Produto</h2><form id="form-produto" class="space-y-4"><input type="text" name="nome" class="form-input" placeholder="Nome do Produto" required><textarea name="descricao" class="form-input" placeholder="Descrição"></textarea><select name="categoria_id" class="form-input" required>${categoriasOptions}</select><div><label class="block mb-2 text-sm">Variações</label><div id="variacoes-container" class="space-y-2"><div class="flex gap-2 variacao-row"><input type="text" placeholder="Nome (ex: Grande)" class="form-input w-2/3 variacao-nome" required><input type="number" step="0.01" placeholder="Preço" class="form-input w-1/3 variacao-preco" required><button type="button" class="text-red-500 btn-remove-variacao"><i class="fas fa-times"></i></button></div></div><button type="button" class="text-sm text-yellow-400 mt-2" id="btn-add-variacao">+ Variação</button></div><div class="flex justify-end gap-4 pt-4"><button type="button" class="btn-cancel bg-gray-600 p-2 px-4 rounded">Cancelar</button><button type="submit" class="bg-green-600 p-2 px-4 rounded">Salvar</button></div></form>`);
        }
        
        if (button.classList.contains('btn-delete-categoria')) { if (confirm('Certeza?')) await handleFormSubmit(`/api/categorias/${button.dataset.id}`, 'DELETE'); }
        if (button.classList.contains('btn-delete-produto')) { if (confirm('Certeza?')) await handleFormSubmit(`/api/produtos/${button.dataset.id}`, 'DELETE'); }
        if (button.classList.contains('btn-delete-entregador')) { if (confirm('Certeza?')) await handleFormSubmit(`/api/entregadores/${button.dataset.id}`, 'DELETE'); }

        if (button.classList.contains('btn-pause-categoria')) await handleFormSubmit(`/api/categorias/${button.dataset.id}/status`, 'PUT', JSON.stringify({ status: button.dataset.status === 'ativo' ? 'pausado' : 'ativo' }));
        if (button.classList.contains('btn-pause-produto')) await handleFormSubmit(`/api/produtos/${button.dataset.id}/status`, 'PUT', JSON.stringify({ status: button.dataset.status === 'ativo' ? 'pausado' : 'ativo' }));
        
        if (button.classList.contains('btn-edit-categoria')) {
            const categoria = state.categorias.find(c => c.id == button.dataset.id);
            modals.show(`<h2 class="text-2xl font-bold mb-4">Editar Categoria</h2><form id="form-categoria" data-entity-id="${categoria.id}"><input type="text" name="nome" class="form-input" value="${categoria.nome}" required><div class="flex justify-end gap-4 pt-4"><button type="button" class="btn-cancel bg-gray-600 p-2 px-4 rounded">Cancelar</button><button type="submit" class="bg-green-600 p-2 px-4 rounded">Atualizar</button></div></form>`);
        }
        if (button.classList.contains('btn-edit-entregador')) {
            const entregador = state.entregadores.find(e => e.id == button.dataset.id);
            modals.show(`<h2 class="text-2xl font-bold mb-4">Editar Entregador</h2><form id="form-entregador" data-entity-id="${entregador.id}"><input type="text" name="nome" class="form-input" value="${entregador.nome}" required><input type="tel" name="telefone" class="form-input" value="${entregador.telefone}" required><div class="flex justify-end gap-4 pt-4"><button type="button" class="btn-cancel bg-gray-600 p-2 px-4 rounded">Cancelar</button><button type="submit" class="bg-green-600 p-2 px-4 rounded">Atualizar</button></div></form>`);
        }
        if (button.classList.contains('btn-edit-produto')) {
            const produto = state.produtos.find(p => p.id == button.dataset.id);
            const categoriasOptions = state.categorias.map(c => `<option value="${c.id}" ${c.id == produto.categoria_id ? 'selected' : ''}>${c.nome}</option>`).join('');
            const variacoesHTML = produto.variacoes.map(v => `<div class="flex gap-2 variacao-row"><input type="text" value="${v.nome}" class="form-input w-2/3 variacao-nome" required><input type="number" step="0.01" value="${v.preco}" class="form-input w-1/3 variacao-preco" required><button type="button" class="text-red-500 btn-remove-variacao"><i class="fas fa-times"></i></button></div>`).join('');
            modals.show(`<h2 class="text-2xl font-bold mb-4">Editar Produto</h2><form id="form-produto" data-entity-id="${produto.id}"><input type="text" name="nome" class="form-input" value="${produto.nome}" required><textarea name="descricao" class="form-input">${produto.descricao}</textarea><select name="categoria_id" class="form-input" required>${categoriasOptions}</select><div><label class="block mb-2 text-sm">Variações</label><div id="variacoes-container" class="space-y-2">${variacoesHTML || ''}</div><button type="button" class="text-sm text-yellow-400 mt-2" id="btn-add-variacao">+ Variação</button></div><div class="flex justify-end gap-4 pt-4"><button type="button" class="btn-cancel bg-gray-600 p-2 px-4 rounded">Cancelar</button><button type="submit" class="bg-green-600 p-2 px-4 rounded">Atualizar</button></div></form>`);
        }
    });
    
    document.body.addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        const id = form.dataset.entityId;

        if (form.id === 'form-produto') {
            const variacoes = Array.from(form.querySelectorAll('.variacao-row')).map(row => ({ nome: row.querySelector('.variacao-nome').value, preco: row.querySelector('.variacao-preco').value }));
            const formData = new FormData(form);
            formData.append('variacoes', JSON.stringify(variacoes));
            await handleFormSubmit(id ? `/api/produtos/${id}` : '/api/produtos', id ? 'PUT' : 'POST', formData);
        } else {
             const body = JSON.stringify(Object.fromEntries(new FormData(form)));
             if (form.id === 'form-pedido') await handleFormSubmit('/api/pedidos', 'POST', body);
             if (form.id === 'form-categoria') await handleFormSubmit(id ? `/api/categorias/${id}` : '/api/categorias', id ? 'PUT' : 'POST', body);
             if (form.id === 'form-entregador') await handleFormSubmit(id ? `/api/entregadores/${id}` : '/api/entregadores', id ? 'PUT' : 'POST', body);
        }
    });

    document.getElementById('pedidos-view').addEventListener('change', async e => {
        const target = e.target;
        if (target.matches('.status-select')) socket.emit('updateOrderStatus', { pedidoId: target.dataset.id, status: target.value });
        if (target.matches('.entregador-select')) await handleFormSubmit(`/api/pedidos/${target.dataset.id}/assign`, 'POST', JSON.stringify({ entregador_id: target.value }));
    });

    socket.on('dataChanged', fetchData);
    socket.on('newOrder', () => { showToast('Novo pedido recebido!'); fetchData(); });
    socket.on('orderStatusUpdated', fetchData);
    
    socket.on('updateDeliveryOnMap', (data) => {
        if (!map) initializeMap();
        const { deliveryId, lat, lng } = data;
        const deliveryPosition = ol.proj.fromLonLat([lng, lat]);
        let tracker = deliveryTrackers[deliveryId];

        if (!tracker) {
            const pedido = state.pedidos.find(p => p.entregador_id == deliveryId && p.status === 'Em Rota');
            if (!pedido || !pedido.lat || !pedido.lng) return;

            const clientLonLat = [pedido.lng, pedido.lat];
            const clientCoords = ol.proj.fromLonLat(clientLonLat);

            const scooterFeature = new ol.Feature({ geometry: new ol.geom.Point(deliveryPosition) });
            scooterFeature.setStyle(new ol.style.Style({ text: new ol.style.Text({ text: '🛵', font: '28px sans-serif' }) }));
            
            const greenLine = new ol.Feature({ geometry: new ol.geom.LineString([deliveryPosition, clientCoords]) });
            greenLine.setStyle(new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'green', width: 5 }) }));
            
            vectorSource.addFeatures([scooterFeature, greenLine]);
            deliveryTrackers[deliveryId] = { scooterFeature, greenLine, clientCoords };
        } else {
            tracker.scooterFeature.getGeometry().setCoordinates(deliveryPosition);
            tracker.greenLine.getGeometry().setCoordinates([deliveryPosition, tracker.clientCoords]);
        }
    });
    
    socket.on('connect', () => {
        console.log('Conectado ao servidor Socket.IO!');
        fetchData();
    });

    document.body.dataset.pizzariaCoords = '-21.788933,-46.568585';
});
