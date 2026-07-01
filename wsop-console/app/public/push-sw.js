// Push handler for the WSOP 2027 Console PWA. Imported into the Workbox-generated
// service worker via vite-plugin-pwa's workbox.importScripts. Shows the nudge as
// a notification and focuses/opens the console on click.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'WSOP 2027 Console'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || 'nudge',
      icon: '/console/icons/icon-192.png',
      badge: '/console/icons/icon-192.png',
      data: { url: data.url || '/console/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/console/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/console') && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
