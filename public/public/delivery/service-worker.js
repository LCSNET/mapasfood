let intervalId;
let deliveryId;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
    if (!event.data) return;

    if (event.data.action === 'start') {
        deliveryId = event.data.deliveryId;
        console.log(`Service Worker: Iniciando rastreamento para o ID ${deliveryId}.`);
        
        if (intervalId) clearInterval(intervalId);
        
        intervalId = setInterval(() => {
            if (!deliveryId) {
                clearInterval(intervalId);
                intervalId = null;
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                position => {
                    const { latitude, longitude } = position.coords;
                    
                    fetch('/api/location', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ deliveryId, lat: latitude, lng: longitude }),
                    })
                    .then(response => {
                        if (response.ok) console.log(`Service Worker (BG): Localização enviada.`);
                    })
                    .catch(error => console.error('Service Worker (BG): Falha ao enviar localização:', error));
                },
                error => console.error('Service Worker (BG): Erro de Geolocalização:', error),
                { enableHighAccuracy: true }
            );
        }, 30000);
    }

    if (event.data.action === 'stop') {
        console.log('Service Worker: Parando rastreamento.');
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        deliveryId = null;
    }
});