document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const trackingId = params.get('id');
    const statusText = document.getElementById('status-text');

    if (!trackingId) {
        statusText.textContent = "ID de rastreamento inválido.";
        return;
    }

    let map, vectorSource, deliveryFeature, greenLineFeature;
    let clientCoords;

    function initializeMap() {
        vectorSource = new ol.source.Vector();
        const vectorLayer = new ol.layer.Vector({ source: vectorSource });
        map = new ol.Map({
            target: 'map',
            layers: [ new ol.layer.Tile({ source: new ol.source.OSM() }), vectorLayer ],
            view: new ol.View({ center: [0, 0], zoom: 2 }),
        });
    }

    async function setupRoute(pizzariaLonLat, clientLonLat) {
        const pizzariaCoords = ol.proj.fromLonLat(pizzariaLonLat);
        clientCoords = ol.proj.fromLonLat(clientLonLat);

        vectorSource.addFeature(new ol.Feature({ geometry: new ol.geom.Point(pizzariaCoords) }));
        vectorSource.addFeature(new ol.Feature({ geometry: new ol.geom.Point(clientCoords) }));

        deliveryFeature = new ol.Feature({ geometry: new ol.geom.Point(pizzariaCoords) });
        deliveryFeature.setStyle(new ol.style.Style({
            text: new ol.style.Text({ text: '🛵', font: '28px sans-serif' })
        }));
        vectorSource.addFeature(deliveryFeature);

        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${pizzariaLonLat.join(',')};${clientLonLat.join(',')}?overview=full&geometries=geojson`;
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

    const socket = io();
    socket.emit('joinTrackingRoom', trackingId);

    initializeMap();
    fetch(`/api/rastreamento/${trackingId}`)
        .then(res => res.json())
        .then(data => {
            if (!data.pedido) { statusText.textContent = "Pedido não encontrado."; return; }
            statusText.textContent = data.pedido.status;
            if (data.pedido.lng && data.pedido.lat) {
                setupRoute([data.pizzaria.lng, data.pizzaria.lat], [data.pedido.lng, data.pedido.lat]);
            }
        });

    socket.on('statusUpdate', (newStatus) => {
        statusText.textContent = newStatus;
        if (newStatus === 'Entregue' && greenLineFeature) {
            vectorSource.removeFeature(greenLineFeature);
        }
    });

    socket.on('locationUpdate', (locationData) => {
        const deliveryPosition = ol.proj.fromLonLat([locationData.lng, locationData.lat]);
        if (deliveryFeature) {
            deliveryFeature.getGeometry().setCoordinates(deliveryPosition);
            updateRemainingRoute(deliveryPosition);
        }
    });
});