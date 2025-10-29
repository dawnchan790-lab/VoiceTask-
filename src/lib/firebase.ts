// Firebase Configuration and Initialization
// This file sets up Firebase services for authentication and database

import { initializeApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  Firestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  updateDoc,
  Timestamp,
  enableIndexedDbPersistence
} from 'firebase/firestore';
import { 
  getMessaging, 
  Messaging,
  getToken,
  onMessage,
  isSupported as isMessagingSupported
} from 'firebase/messaging';

// Firebase configuration
// IMPORTANT: Replace these values with your actual Firebase project credentials
// You can find these in Firebase Console > Project Settings > General
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID"
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let messaging: Messaging | null = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  
  // Initialize Firebase Messaging (only supported in browser with service worker)
  if (typeof window !== 'undefined') {
    isMessagingSupported().then((supported) => {
      if (supported) {
        messaging = getMessaging(app);
        console.log('📬 Firebase Messaging initialized');
      } else {
        console.warn('⚠️ Firebase Messaging not supported in this browser');
      }
    });
  }
  
  // Enable offline persistence
  enableIndexedDbPersistence(db)
    .then(() => {
      console.log('💾 Firestore offline persistence enabled');
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('⚠️ Multiple tabs open, persistence can only be enabled in one tab at a time.');
      } else if (err.code === 'unimplemented') {
        console.warn('⚠️ Current browser does not support offline persistence.');
      } else {
        console.warn('⚠️ Firestore persistence error:', err);
      }
    });
  
  console.log('🔥 Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
}

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();

// Authentication Functions
export const firebaseAuth = {
  // Sign in with Google
  signInWithGoogle: async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log('✅ Google sign-in successful:', result.user.email);
      return { user: result.user, error: null };
    } catch (error: any) {
      console.error('❌ Google sign-in error:', error);
      return { user: null, error: error.message };
    }
  },

  // Sign in with Email/Password
  signInWithEmail: async (email: string, password: string) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      console.log('✅ Email sign-in successful:', result.user.email);
      return { user: result.user, error: null };
    } catch (error: any) {
      console.error('❌ Email sign-in error:', error);
      return { user: null, error: error.message };
    }
  },

  // Create new account with Email/Password
  signUpWithEmail: async (email: string, password: string, displayName?: string) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create user profile in Firestore
      await setDoc(doc(db, 'users', result.user.uid), {
        email: result.user.email,
        displayName: displayName || email.split('@')[0],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      
      console.log('✅ Email sign-up successful:', result.user.email);
      return { user: result.user, error: null };
    } catch (error: any) {
      console.error('❌ Email sign-up error:', error);
      return { user: null, error: error.message };
    }
  },

  // Sign out
  signOut: async () => {
    try {
      await signOut(auth);
      console.log('✅ Sign-out successful');
      return { error: null };
    } catch (error: any) {
      console.error('❌ Sign-out error:', error);
      return { error: error.message };
    }
  },

  // Get current user
  getCurrentUser: () => {
    return auth.currentUser;
  },

  // Listen to auth state changes
  onAuthStateChanged: (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, callback);
  }
};

// Firestore Database Functions
export const firebaseDb = {
  // Tasks collection
  tasks: {
    // Get all tasks for a user
    getAll: async (userId: string) => {
      try {
        const q = query(
          collection(db, 'tasks'),
          where('userId', '==', userId),
          orderBy('dateISO', 'asc')
        );
        const snapshot = await getDocs(q);
        const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`✅ Loaded ${tasks.length} tasks for user ${userId}`);
        return { tasks, error: null };
      } catch (error: any) {
        console.error('❌ Get tasks error:', error);
        return { tasks: [], error: error.message };
      }
    },

    // Listen to real-time updates
    subscribe: (userId: string, callback: (tasks: any[]) => void) => {
      const q = query(
        collection(db, 'tasks'),
        where('userId', '==', userId),
        orderBy('dateISO', 'asc')
      );
      
      return onSnapshot(q, (snapshot) => {
        const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`🔄 Real-time update: ${tasks.length} tasks`);
        callback(tasks);
      }, (error) => {
        console.error('❌ Snapshot error:', error);
      });
    },

    // Add a new task
    add: async (userId: string, task: any) => {
      try {
        const taskData = {
          ...task,
          userId,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };
        await setDoc(doc(db, 'tasks', task.id), taskData);
        console.log('✅ Task added:', task.id);
        return { error: null };
      } catch (error: any) {
        console.error('❌ Add task error:', error);
        return { error: error.message };
      }
    },

    // Update a task
    update: async (taskId: string, updates: any) => {
      try {
        await updateDoc(doc(db, 'tasks', taskId), {
          ...updates,
          updatedAt: Timestamp.now()
        });
        console.log('✅ Task updated:', taskId);
        return { error: null };
      } catch (error: any) {
        console.error('❌ Update task error:', error);
        return { error: error.message };
      }
    },

    // Delete a task
    delete: async (taskId: string) => {
      try {
        await deleteDoc(doc(db, 'tasks', taskId));
        console.log('✅ Task deleted:', taskId);
        return { error: null };
      } catch (error: any) {
        console.error('❌ Delete task error:', error);
        return { error: error.message };
      }
    }
  },

  // User profile functions
  users: {
    // Get user profile
    get: async (userId: string) => {
      try {
        const docSnap = await getDoc(doc(db, 'users', userId));
        if (docSnap.exists()) {
          console.log('✅ User profile loaded:', userId);
          return { user: docSnap.data(), error: null };
        }
        return { user: null, error: 'User not found' };
      } catch (error: any) {
        console.error('❌ Get user error:', error);
        return { user: null, error: error.message };
      }
    },

    // Update user profile
    update: async (userId: string, updates: any) => {
      try {
        await updateDoc(doc(db, 'users', userId), {
          ...updates,
          updatedAt: Timestamp.now()
        });
        console.log('✅ User profile updated:', userId);
        return { error: null };
      } catch (error: any) {
        console.error('❌ Update user error:', error);
        return { error: error.message };
      }
    }
  }
};

// Firebase Cloud Messaging Functions
export const firebaseMessaging = {
  // Check if messaging is supported
  isSupported: async () => {
    try {
      return await isMessagingSupported();
    } catch {
      return false;
    }
  },

  // Request notification permission and get FCM token
  requestPermissionAndGetToken: async (vapidKey: string) => {
    try {
      // Check if Notification API is supported
      if (!('Notification' in window)) {
        console.warn('⚠️ This browser does not support notifications');
        return { token: null, error: 'Notifications not supported' };
      }

      // Check if messaging is initialized
      if (!messaging) {
        console.warn('⚠️ Firebase Messaging not initialized');
        return { token: null, error: 'Messaging not initialized' };
      }

      // Request permission
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        console.warn('⚠️ Notification permission denied');
        return { token: null, error: 'Permission denied' };
      }

      console.log('✅ Notification permission granted');

      // Get FCM token
      const token = await getToken(messaging, { vapidKey });
      console.log('📱 FCM Token obtained:', token.substring(0, 20) + '...');
      
      return { token, error: null };
    } catch (error: any) {
      console.error('❌ Get FCM token error:', error);
      return { token: null, error: error.message };
    }
  },

  // Save FCM token to Firestore
  saveTokenToFirestore: async (userId: string, token: string) => {
    try {
      const tokenDoc = doc(db, 'users', userId, 'fcmTokens', token);
      await setDoc(tokenDoc, {
        token,
        createdAt: Timestamp.now(),
        lastUsed: Timestamp.now(),
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform
        }
      });
      console.log('✅ FCM token saved to Firestore');
      return { error: null };
    } catch (error: any) {
      console.error('❌ Save FCM token error:', error);
      return { error: error.message };
    }
  },

  // Listen for foreground messages
  onForegroundMessage: (callback: (payload: any) => void) => {
    if (!messaging) {
      console.warn('⚠️ Firebase Messaging not initialized');
      return () => {};
    }

    return onMessage(messaging, (payload) => {
      console.log('📬 Foreground message received:', payload);
      callback(payload);
    });
  },

  // Get current notification permission status
  getPermissionStatus: () => {
    if (!('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  }
};

// Export Firebase instances
export { app, auth, db, messaging };
export default { firebaseAuth, firebaseDb, firebaseMessaging };
