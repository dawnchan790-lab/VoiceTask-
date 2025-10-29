// Service Worker Registration and Management
// Handles registration of Firebase Messaging service worker

export const serviceWorkerManager = {
  // Register service worker
  register: async () => {
    try {
      // Check if service workers are supported
      if (!('serviceWorker' in navigator)) {
        console.warn('⚠️ Service workers are not supported in this browser');
        return { registration: null, error: 'Service workers not supported' };
      }

      console.log('🔧 Registering service worker...');

      // Register the service worker
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      });

      console.log('✅ Service worker registered:', registration.scope);

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;
      console.log('✅ Service worker ready');

      return { registration, error: null };
    } catch (error: any) {
      console.error('❌ Service worker registration error:', error);
      return { registration: null, error: error.message };
    }
  },

  // Unregister service worker
  unregister: async () => {
    try {
      if (!('serviceWorker' in navigator)) {
        return { success: false, error: 'Service workers not supported' };
      }

      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.unregister();
        console.log('✅ Service worker unregistered');
        return { success: true, error: null };
      }

      return { success: false, error: 'No service worker registered' };
    } catch (error: any) {
      console.error('❌ Service worker unregister error:', error);
      return { success: false, error: error.message };
    }
  },

  // Check if service worker is registered
  isRegistered: async () => {
    try {
      if (!('serviceWorker' in navigator)) {
        return false;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      return !!registration;
    } catch {
      return false;
    }
  },

  // Get current service worker registration
  getRegistration: async () => {
    try {
      if (!('serviceWorker' in navigator)) {
        return null;
      }

      return await navigator.serviceWorker.getRegistration();
    } catch {
      return null;
    }
  }
};

export default serviceWorkerManager;
