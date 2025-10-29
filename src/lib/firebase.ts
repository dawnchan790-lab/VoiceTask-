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
  Timestamp
} from 'firebase/firestore';

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

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
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

// Export Firebase instances
export { app, auth, db };
export default { firebaseAuth, firebaseDb };
