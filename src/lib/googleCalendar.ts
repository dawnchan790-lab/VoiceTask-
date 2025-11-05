// Google Calendar API Integration
// This file handles Google Calendar API operations for syncing tasks

// Google API Client configuration
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

// Google API Client interfaces
interface GoogleAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: string;
      minutes: number;
    }>;
  };
}

// Load Google API script
let gapiInited = false;
let gisInited = false;
let tokenClient: any = null;

export const googleCalendar = {
  /**
   * Initialize Google API client
   */
  init: async (): Promise<{ success: boolean; error?: string }> => {
    try {
      // 環境変数の確認
      console.log('🔍 Google Calendar 環境変数チェック:');
      console.log('  CLIENT_ID:', GOOGLE_CLIENT_ID ? '✅ 設定済み' : '❌ 未設定');
      console.log('  API_KEY:', GOOGLE_API_KEY ? '✅ 設定済み' : '❌ 未設定');
      
      if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
        return { 
          success: false, 
          error: 'Google APIの認証情報が設定されていません。環境変数を確認してください。' 
        };
      }

      // Load gapi script
      if (!gapiInited) {
        console.log('📦 Google API スクリプトを読み込み中...');
        await loadScript('https://apis.google.com/js/api.js');
        await new Promise((resolve) => {
          (window as any).gapi.load('client', resolve);
        });
        await (window as any).gapi.client.init({
          apiKey: GOOGLE_API_KEY,
          discoveryDocs: [DISCOVERY_DOC],
        });
        gapiInited = true;
        console.log('✅ Google API client initialized');
      }

      // Load gis script
      if (!gisInited) {
        console.log('📦 Google Identity Services スクリプトを読み込み中...');
        await loadScript('https://accounts.google.com/gsi/client');
        tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPES,
          callback: '', // Will be set per request
        });
        gisInited = true;
        console.log('✅ Google Identity Services initialized');
      }

      return { success: true };
    } catch (error: any) {
      console.error('❌ Google API initialization error:', error);
      return { success: false, error: error.message || 'Google APIの初期化に失敗しました' };
    }
  },

  /**
   * Request access token for Google Calendar API
   */
  requestAccessToken: (): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        // タイムアウト設定（30秒）
        const timeout = setTimeout(() => {
          reject(new Error('OAuth認証がタイムアウトしました。ポップアップがブロックされている可能性があります。'));
        }, 30000);

        tokenClient.callback = (response: GoogleAuthResponse) => {
          clearTimeout(timeout);
          if (response.error) {
            console.error('❌ OAuth error:', response);
            reject(new Error(response.error || 'OAuth認証に失敗しました'));
            return;
          }
          console.log('✅ Access token received');
          resolve(response.access_token);
        };

        console.log('🔐 OAuth認証ウィンドウを開きます...');
        console.log('⚠️ ポップアップブロッカーが有効な場合は、許可してください');
        
        if ((window as any).gapi.client.getToken() === null) {
          // Prompt user to consent
          tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
          // Skip consent if already granted
          tokenClient.requestAccessToken({ prompt: '' });
        }
      } catch (error) {
        console.error('❌ Access token request error:', error);
        reject(error);
      }
    });
  },

  /**
   * Check if user has granted Google Calendar access
   */
  hasAccessToken: (): boolean => {
    return (window as any).gapi?.client?.getToken() !== null;
  },

  /**
   * Revoke access token
   */
  revokeAccessToken: () => {
    const token = (window as any).gapi?.client?.getToken();
    if (token !== null) {
      (window as any).google.accounts.oauth2.revoke(token.access_token, () => {
        console.log('✅ Access token revoked');
      });
      (window as any).gapi.client.setToken(null);
    }
  },

  /**
   * Create a Google Calendar event from VoiceTask
   */
  createEvent: async (task: any): Promise<{ success: boolean; eventId?: string; error?: string }> => {
    try {
      // Ensure API is initialized
      const initResult = await googleCalendar.init();
      if (!initResult.success) {
        return { success: false, error: initResult.error };
      }

      // Ensure we have access token
      if (!googleCalendar.hasAccessToken()) {
        await googleCalendar.requestAccessToken();
      }

      // Prepare event data
      const startTime = new Date(task.dateISO);
      const endTime = new Date(startTime.getTime() + task.durationMin * 60000);

      const event: GoogleCalendarEvent = {
        summary: task.title,
        description: task.note || '',
        start: {
          dateTime: startTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };

      // Add reminders if notification is enabled
      if (task.notify && task.notificationTimings && task.notificationTimings.length > 0) {
        event.reminders = {
          useDefault: false,
          overrides: task.notificationTimings.map((minutes: number) => ({
            method: 'popup',
            minutes: minutes
          })),
        };
      } else if (task.notify) {
        // Fallback to 10 minutes if notificationTimings is not set
        event.reminders = {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 10 }],
        };
      }

      // Create event via API
      const response = await (window as any).gapi.client.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });

      console.log('✅ Google Calendar event created:', response.result.id);
      return { success: true, eventId: response.result.id };
    } catch (error: any) {
      console.error('❌ Google Calendar event creation error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update a Google Calendar event
   */
  updateEvent: async (eventId: string, task: any): Promise<{ success: boolean; error?: string }> => {
    try {
      // Ensure we have access token
      if (!googleCalendar.hasAccessToken()) {
        await googleCalendar.requestAccessToken();
      }

      // Prepare updated event data
      const startTime = new Date(task.dateISO);
      const endTime = new Date(startTime.getTime() + task.durationMin * 60000);

      const event: GoogleCalendarEvent = {
        summary: task.title,
        description: task.note || '',
        start: {
          dateTime: startTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };

      if (task.notify && task.notificationTimings && task.notificationTimings.length > 0) {
        event.reminders = {
          useDefault: false,
          overrides: task.notificationTimings.map((minutes: number) => ({
            method: 'popup',
            minutes: minutes
          })),
        };
      } else if (task.notify) {
        // Fallback to 10 minutes if notificationTimings is not set
        event.reminders = {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 10 }],
        };
      }

      // Update event via API
      await (window as any).gapi.client.calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        resource: event,
      });

      console.log('✅ Google Calendar event updated:', eventId);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Google Calendar event update error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Delete a Google Calendar event
   */
  deleteEvent: async (eventId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Ensure we have access token
      if (!googleCalendar.hasAccessToken()) {
        await googleCalendar.requestAccessToken();
      }

      // Delete event via API
      await (window as any).gapi.client.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });

      console.log('✅ Google Calendar event deleted:', eventId);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Google Calendar event delete error:', error);
      return { success: false, error: error.message };
    }
  },
};

// Helper function to load external scripts
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if script already loaded
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}
