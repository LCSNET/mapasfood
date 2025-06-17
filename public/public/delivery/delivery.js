document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '';
    const socket = io(window.location.origin);
    const loginView = document.getElementById('login-view');
    const trackingView = document.getElementById('tracking-view');
    const loginForm = document.getElementById('login-form');
    const deliveryIdInput = document.getElementById('delivery-id-input');
    const deliveryNameEl = document.getElementById('delivery-name');
    const stopTrackingBtn = document.getElementById('stop-tracking-btn');
    const btnMarkDelivered = document.getElementById('btn-mark-delivered');
    const clientNameEl = document.getElementById('client-name');
    const clientAddressEl = document.getElementById('client-address');
    const orderIdEl = document.getElementById('order-id');
    const mapContainer = document.getElementById('delivery-map-container');

    let watchId, currentDeliveryId, currentOrderId;
    let map, vectorSource, deliveryFeature, greenLineFeature, clientCoords;
    
    const PIZZARIA_COORDS_LONLAT = [-46.568585, -21.788933];

    function initializeMap() {
        if (!map && mapContainer) {
            vectorSource = new ol.source.Vector();
            const vectorLayer = new ol.layer.Vector({ source: vectorSource });
            map = new ol.Map({
                target: mapContainer,
                layers: [ new ol.layer.Tile({ source: new ol.source.OSM() }), vectorLayer ],
                view: new ol.View({ center: ol.proj.fromLonLat(PIZZARIA_COORDS_LONLAT), zoom: 13 }),
            });
        }
    }
    
    async function drawRouteOnMap(localClienteLonLat) {
        if (!map) initializeMap();
        vectorSource.clear();
        clientCoords = ol.proj.fromLonLat(localClienteLonLat);

        const pizzariaFeature = new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat(PIZZARIA_COORDS_LONLAT)) });
        const clientFeature = new ol.Feature({ geometry: new ol.geom.Point(clientCoords) });
        vectorSource.addFeatures([pizzariaFeature, clientFeature]);

        deliveryFeature = new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat(PIZZARIA_COORDS_LONLAT)) });
        deliveryFeature.setStyle(new ol.style.Style({
            text: new ol.style.Text({ text: '🛵', font: '28px sans-serif' })
        }));
        vectorSource.addFeature(deliveryFeature);
        
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${PIZZARIA_COORDS_LONLAT.join(',')};${localClienteLonLat.join(',')}?overview=full&geometries=geojson`;
        try {
            const routeResponse = await fetch(osrmUrl);
            const routeData = await routeResponse.json();
            if (routeData.routes && routeData.routes.length > 0) {
                const routeFeature = new ol.format.GeoJSON().readFeature(routeData.routes[0].geometry, { featureProjection: 'EPSG:3857' });
                routeFeature.setStyle(new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'grey', width: 5, lineDash: [10, 10] }) }));
                vectorSource.addFeature(routeFeature);
            }
        } catch(e) { console.error("Erro ao buscar rota OSRM:", e); }

        map.getView().fit(vectorSource.getExtent(), { padding: [50, 50, 50, 50], duration: 1000 });
    }

    function updateRemainingRoute(deliveryPosition) {
        if (vectorSource && deliveryFeature && clientCoords) {
            if (greenLineFeature) vectorSource.removeFeature(greenLineFeature);
            greenLineFeature = new ol.Feature({ geometry: new ol.geom.LineString([deliveryPosition, clientCoords]) });
            greenLineFeature.setStyle(new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'green', width: 5 }) }));
            vectorSource.addFeature(greenLineFeature);
        }
    }

    const fetchCurrentOrder = async (deliveryId) => {
        try {
            const response = await fetch(`${API_URL}/api/entregadores/${deliveryId}/pedido`);
            deliveryNameEl.textContent = `Olá, Entregador #${deliveryId}`;
            if (response.ok) {
                const order = await response.json();
                clientNameEl.textContent = order.cliente_nome;
                clientAddressEl.textContent = order.endereco;
                orderIdEl.textContent = `#${order.id}`;
                currentOrderId = order.id;
                btnMarkDelivered.classList.remove('hidden');
                if (order.lng && order.lat) {
                    drawRouteOnMap([order.lng, order.lat]);
                }
            } else {
                clientNameEl.textContent = 'Nenhum pedido atribuído';
                clientAddressEl.textContent = 'Aguardando...';
                orderIdEl.textContent = '-';
                currentOrderId = null;
                btnMarkDelivered.classList.add('hidden');
                if(vectorSource) vectorSource.clear();
            }
        } catch (error) { console.error('Erro ao buscar pedido:', error); }
    };
    
    const startTracking = (deliveryId) => {
        localStorage.setItem('deliveryId', deliveryId);
        loginView.classList.add('hidden');
        trackingView.classList.remove('hidden');
        currentDeliveryId = deliveryId;
        initializeMap();
        fetchCurrentOrder(deliveryId);
        
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const deliveryPosition = ol.proj.fromLonLat([longitude, latitude]);
                socket.emit('deliveryLocationUpdate', { deliveryId, lat: latitude, lng: longitude });
                if(deliveryFeature) {
                    deliveryFeature.getGeometry().setCoordinates(deliveryPosition);
                    updateRemainingRoute(deliveryPosition);
                }
            },
            (err) => console.error("Erro de Geolocalização:", err), { enableHighAccuracy: true }
        );
    };

    const stopTracking = () => {
        if (watchId) navigator.geolocation.clearWatch(watchId);
        watchId = null;
        currentDeliveryId = null;
        currentOrderId = null;
        localStorage.removeItem('deliveryId');
        trackingView.classList.add('hidden');
        loginView.classList.remove('hidden');
        if(map) { map.setTarget(null); map = null; }
    };

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        startTracking(deliveryIdInput.value);
    });
    stopTrackingBtn.addEventListener('click', stopTracking);
    btnMarkDelivered.addEventListener('click', () => {
        if (currentOrderId && confirm(`Confirmar entrega do pedido #${currentOrderId}?`)) {
            socket.emit('updateOrderStatus', { pedidoId: currentOrderId, status: 'Entregue' });
            fetchCurrentOrder(currentDeliveryId);
        }
    });
    socket.on('orderAssigned', ({ deliveryId }) => {
        if (deliveryId == currentDeliveryId) {
            alert('Novo pedido atribuído a você!');
            fetchCurrentOrder(currentDeliveryId);
        }
    });
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/delivery/service-worker.js').then(reg => console.log('SW Registrado'));
    }
    const savedId = localStorage.getItem('deliveryId');
    if (savedId) startTracking(savedId);
});
