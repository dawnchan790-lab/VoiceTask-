import React, { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO, startOfToday, isToday, isTomorrow, addMinutes, isAfter, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, isSameMonth, isSameDay, eachDayOfInterval } from "date-fns";
import { ja } from "date-fns/locale";
import * as chrono from "chrono-node";
import { v4 as uuidv4 } from "uuid";

// -----------------------------
// iCalendar Export Utilities
// -----------------------------
function formatICalDate(date: Date): string {
  // iCalendar形式: YYYYMMDDTHHMMSSZ
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function escapeICalText(text: string): string {
  // iCalendar形式のテキストエスケープ
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function generateICalendar(tasks: any[]): string {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VoiceTask//VoiceTask Calendar Export//JP',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:VoiceTask 予定',
    'X-WR-TIMEZONE:Asia/Tokyo',
  ];

  tasks.forEach((task: any) => {
    const startDate = new Date(task.dateISO);
    const endDate = addMinutes(startDate, task.durationMin);
    
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${task.id}@voicetask.app`);
    lines.push(`DTSTAMP:${formatICalDate(now)}`);
    lines.push(`DTSTART:${formatICalDate(startDate)}`);
    lines.push(`DTEND:${formatICalDate(endDate)}`);
    lines.push(`SUMMARY:${escapeICalText(task.title)}`);
    
    if (task.note) {
      lines.push(`DESCRIPTION:${escapeICalText(task.note)}`);
    }
    
    if (task.priority === 'high') {
      lines.push('PRIORITY:1');
    } else if (task.priority === 'normal') {
      lines.push('PRIORITY:5');
    } else {
      lines.push('PRIORITY:9');
    }
    
    lines.push(`STATUS:${task.done ? 'COMPLETED' : 'CONFIRMED'}`);
    
    if (task.notify) {
      lines.push('BEGIN:VALARM');
      lines.push('TRIGGER:-PT10M');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${escapeICalText(task.title)}`);
      lines.push('END:VALARM');
    }
    
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function downloadICalendar(tasks: any[], filename: string = 'voicetask-calendar.ics') {
  const icsContent = generateICalendar(tasks);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =============================
// VoiceTask: Fully Responsive React App
// - Mobile-first design (iPhone, iPad, Android, Desktop)
// - Touch-optimized UI with minimum 44x44px tap targets
// - Swipe gestures for calendar navigation
// - PWA-ready with viewport optimization
// - Safe area support for notched devices
// =============================

// -----------------------------
// Types
// -----------------------------
/** @typedef {"low" | "normal" | "high"} Priority */

/**
 * 繰り返しパターンの種類
 */
type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

/**
 * 繰り返しルール
 */
interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number; // 1 = 毎日/毎週, 2 = 隔日/隔週, etc.
  daysOfWeek?: number[]; // 0=日曜, 1=月曜, ..., 6=土曜 (weekly用)
  dayOfMonth?: number; // 1-31 (monthly用)
  endDate?: string; // ISO format (終了日)
  count?: number; // 繰り返し回数制限
}

/**
 * カテゴリ
 */
interface Category {
  id: string;
  name: string;
  color: string; // Tailwind color class (e.g., "violet", "blue", "green")
  icon?: string; // Emoji icon
}

/**
 * @typedef Task
 * @property {string} id
 * @property {string} title
 * @property {string} note
 * @property {string} dateISO // Start datetime
 * @property {number} durationMin
 * @property {Priority} priority
 * @property {boolean} done
 * @property {boolean} notify
 * @property {RecurrenceRule?} recurrence // 繰り返しルール（任意）
 * @property {string?} recurrenceId // 繰り返しタスクのグループID
 * @property {string?} originalDate // 元の予定日（編集された場合）
 * @property {string?} category // カテゴリID
 * @property {string[]?} tags // タグのリスト
 * @property {string?} googleCalendarEventId // Google Calendar Event ID
 */

/**
 * デフォルトカテゴリ
 */
const defaultCategories: Category[] = [
  { id: 'work', name: '仕事', color: 'blue', icon: '💼' },
  { id: 'personal', name: '個人', color: 'violet', icon: '🏠' },
  { id: 'health', name: '健康', color: 'green', icon: '💪' },
  { id: 'study', name: '勉強', color: 'yellow', icon: '📚' },
  { id: 'meeting', name: '会議', color: 'red', icon: '🤝' },
  { id: 'hobby', name: '趣味', color: 'pink', icon: '🎨' },
];

// -----------------------------
// Japanese Holidays
// -----------------------------
/**
 * 日本の祝日データ（2024-2026年）
 */
const japaneseHolidays: { [key: string]: string } = {
  // 2024年
  '2024-01-01': '元日',
  '2024-01-08': '成人の日',
  '2024-02-11': '建国記念の日',
  '2024-02-12': '振替休日',
  '2024-02-23': '天皇誕生日',
  '2024-03-20': '春分の日',
  '2024-04-29': '昭和の日',
  '2024-05-03': '憲法記念日',
  '2024-05-04': 'みどりの日',
  '2024-05-05': 'こどもの日',
  '2024-05-06': '振替休日',
  '2024-07-15': '海の日',
  '2024-08-11': '山の日',
  '2024-08-12': '振替休日',
  '2024-09-16': '敬老の日',
  '2024-09-22': '秋分の日',
  '2024-09-23': '振替休日',
  '2024-10-14': 'スポーツの日',
  '2024-11-03': '文化の日',
  '2024-11-04': '振替休日',
  '2024-11-23': '勤労感謝の日',
  
  // 2025年
  '2025-01-01': '元日',
  '2025-01-13': '成人の日',
  '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日',
  '2025-02-24': '振替休日',
  '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日',
  '2025-05-03': '憲法記念日',
  '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日',
  '2025-05-06': '振替休日',
  '2025-07-21': '海の日',
  '2025-08-11': '山の日',
  '2025-09-15': '敬老の日',
  '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日',
  '2025-11-03': '文化の日',
  '2025-11-23': '勤労感謝の日',
  '2025-11-24': '振替休日',
  
  // 2026年
  '2026-01-01': '元日',
  '2026-01-12': '成人の日',
  '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日',
  '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日',
  '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日',
  '2026-05-06': '振替休日',
  '2026-07-20': '海の日',
  '2026-08-11': '山の日',
  '2026-09-21': '敬老の日',
  '2026-09-22': '国民の休日',
  '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日',
};

/**
 * 指定した日付が祝日かどうかを判定
 */
function isHoliday(date: Date): string | null {
  const dateStr = format(date, 'yyyy-MM-dd');
  return japaneseHolidays[dateStr] || null;
}

// -----------------------------
// Utilities
// -----------------------------
const KEY = (email: string) => `voicetask_${email}`;

const defaultLeadMin = 10;

function loadTasks(email: string) {
  try {
    const raw = localStorage.getItem(KEY(email));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

function saveTasks(email: string, tasks: any[]) {
  localStorage.setItem(KEY(email), JSON.stringify(tasks));
}

function classNames(...xs: any[]) {
  return xs.filter(Boolean).join(" ");
}

function ensureNotificationPermission() {
  if (!("Notification" in window)) return Promise.resolve("unsupported");
  if (Notification.permission === "granted") return Promise.resolve("granted");
  if (Notification.permission === "denied") return Promise.resolve("denied");
  return Notification.requestPermission();
}

// Simple in-tab scheduler (for demo). For production, move to SW.
const timers = new Map();
function scheduleNotification(task: any) {
  if (!task.notify) return;
  if (!("Notification" in window)) return;
  const when = new Date(task.dateISO);
  const fireAt = addMinutes(when, -defaultLeadMin);
  const delay = fireAt.getTime() - Date.now();
  if (delay <= 0) return; // already past
  const t = setTimeout(() => {
    try {
      new Notification("VoiceTask 予定リマインド", {
        body: `${format(when, "M/d H:mm", { locale: ja })} – ${task.title}`,
        silent: false,
      });
    } catch {}
  }, delay);
  timers.set(task.id, t);
}

function clearNotification(taskId: string) {
  const t = timers.get(taskId);
  if (t) {
    clearTimeout(t);
    timers.delete(taskId);
  }
}

// -----------------------------
// NLP parsing (Japanese-friendly)
// -----------------------------
function parseVoiceTextToTask(text: string, targetDate: Date) {
  // Heuristics:
  // - Use specified targetDate for the task date
  // - Extract time via chrono (ja locale auto-detect) - only time, not date
  // - Detect priority keywords: "重要", "至急", "最優先"
  // - Detect duration like "30分", "1時間"; default 30m
  // - Title = remaining text after removing parsed parts / keywords
  
  // ターゲット日付をコピーして、デフォルトは午前9時
  const refDate = new Date(targetDate);
  refDate.setHours(9, 0, 0, 0);
  
  // 時刻のみを解析（日付は使用しない）
  const results = chrono.parse(text, new Date(), { forwardDate: true });
  
  if (results && results.length > 0 && results[0].start) {
    const hasTime = results[0].start.get('hour') !== null;
    if (hasTime) {
      // 時刻が指定されている場合は、それを使用
      const hour = results[0].start.get('hour');
      const minute = results[0].start.get('minute') || 0;
      refDate.setHours(hour, minute, 0, 0);
    }
  }

  // duration
  let durationMin = 30;
  const durMatch = text.match(/(\d+)(分|時間)/);
  if (durMatch) {
    const n = parseInt(durMatch[1]);
    durationMin = durMatch[2] === "時間" ? n * 60 : n;
  }

  // priority
  let priority = /重要|至急|最優先/.test(text) ? "high" : "normal";

  // カテゴリの解析
  let category: string | undefined;
  for (const cat of defaultCategories) {
    if (text.includes(cat.name) || text.includes(cat.icon)) {
      category = cat.id;
      break;
    }
  }

  // タグの解析（#で始まる単語）
  const tagMatches = text.match(/#[^\s#]+/g);
  const tags = tagMatches ? tagMatches.map(t => t.substring(1)) : [];

  // 繰り返しパターンの解析
  let recurrence: RecurrenceRule | undefined;
  
  if (/毎日/.test(text)) {
    recurrence = { frequency: 'daily', interval: 1 };
  } else if (/毎週/.test(text)) {
    recurrence = { frequency: 'weekly', interval: 1 };
    // 曜日指定の解析
    const dayMatch = text.match(/毎週(月|火|水|木|金|土|日)(曜日?)?/);
    if (dayMatch) {
      const dayMap: { [key: string]: number } = {
        '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6
      };
      recurrence.daysOfWeek = [dayMap[dayMatch[1]]];
    }
  } else if (/毎月/.test(text)) {
    recurrence = { frequency: 'monthly', interval: 1 };
    // 日付指定の解析
    const dayMatch = text.match(/毎月(\d{1,2})日/);
    if (dayMatch) {
      recurrence.dayOfMonth = parseInt(dayMatch[1]);
    } else {
      recurrence.dayOfMonth = refDate.getDate();
    }
  } else if (/隔日|一日おき/.test(text)) {
    recurrence = { frequency: 'daily', interval: 2 };
  } else if (/隔週/.test(text)) {
    recurrence = { frequency: 'weekly', interval: 2 };
  }

  // title cleanup - 日付関連のキーワードと繰り返しキーワード、カテゴリ名、タグを削除
  let title = text
    .replace(/(\d{1,2}:\d{2}|午前|午後|AM|PM|\d+分|\d+時間|重要|至急|最優先)/g, "")
    .replace(/(毎日|毎週|毎月|毎年|隔日|隔週|一日おき)(月|火|水|木|金|土|日)?(曜日?)?/g, "")
    .replace(/毎月\d{1,2}日/g, "")
    .replace(/#[^\s#]+/g, "") // タグ削除
    .replace(/[\s　]+/g, " ")
    .trim();
  
  // カテゴリ名を削除
  for (const cat of defaultCategories) {
    title = title.replace(new RegExp(cat.name, 'g'), '').replace(new RegExp(cat.icon, 'g'), '');
  }
  
  title = title.replace(/[\s　]+/g, " ").trim();
  if (!title) title = "ボイスメモ";

  const task: any = {
    id: uuidv4(),
    title,
    note: text,
    dateISO: refDate.toISOString(),
    durationMin,
    priority,
    done: false,
    notify: priority === "high", // high -> notify by default
  };

  // 繰り返しルールがある場合は追加
  if (recurrence) {
    task.recurrence = recurrence;
    task.recurrenceId = uuidv4(); // グループID
  }

  // カテゴリがある場合は追加
  if (category) {
    task.category = category;
  }

  // タグがある場合は追加
  if (tags.length > 0) {
    task.tags = tags;
  }

  return task;
}

// -----------------------------
// Recurrence Task Generation
// -----------------------------
/**
 * 繰り返しタスクのインスタンスを生成
 * @param baseTask 元となるタスク（recurrenceプロパティを持つ）
 * @param startDate 生成開始日
 * @param endDate 生成終了日
 * @returns 生成されたタスクインスタンスの配列
 */
function generateRecurrenceInstances(baseTask: any, startDate: Date, endDate: Date): any[] {
  if (!baseTask.recurrence) return [];

  const { frequency, interval, daysOfWeek, dayOfMonth, endDate: ruleEndDate, count } = baseTask.recurrence;
  const instances: any[] = [];
  
  const baseDate = new Date(baseTask.dateISO);
  const baseTime = { hours: baseDate.getHours(), minutes: baseDate.getMinutes() };
  
  let currentDate = new Date(startDate);
  currentDate.setHours(baseTime.hours, baseTime.minutes, 0, 0);
  
  const finalEndDate = ruleEndDate ? new Date(ruleEndDate) : endDate;
  let instanceCount = 0;

  while (currentDate <= finalEndDate && currentDate <= endDate) {
    // 回数制限チェック
    if (count && instanceCount >= count) break;

    let shouldGenerate = false;

    if (frequency === 'daily') {
      shouldGenerate = true;
    } else if (frequency === 'weekly' && daysOfWeek) {
      const dayOfWeek = currentDate.getDay();
      shouldGenerate = daysOfWeek.includes(dayOfWeek);
    } else if (frequency === 'monthly' && dayOfMonth) {
      shouldGenerate = currentDate.getDate() === dayOfMonth;
    }

    if (shouldGenerate && currentDate >= startDate) {
      instances.push({
        ...baseTask,
        id: uuidv4(),
        dateISO: currentDate.toISOString(),
        done: false,
        recurrenceId: baseTask.recurrenceId || baseTask.id,
        originalDate: currentDate.toISOString()
      });
      instanceCount++;
    }

    // 次の日付に進む
    if (frequency === 'daily') {
      currentDate = new Date(currentDate.getTime() + interval * 24 * 60 * 60 * 1000);
    } else if (frequency === 'weekly') {
      currentDate = new Date(currentDate.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
    } else if (frequency === 'monthly') {
      const nextMonth = currentDate.getMonth() + interval;
      currentDate = new Date(currentDate.getFullYear(), nextMonth, dayOfMonth || 1, baseTime.hours, baseTime.minutes);
    } else {
      break;
    }
  }

  return instances;
}

/**
 * 既存のタスクリストから繰り返しタスクのベースタスク（マスタータスク）を抽出
 */
function getRecurrenceMasters(tasks: any[]): any[] {
  const masters = new Map<string, any>();
  
  tasks.forEach(task => {
    if (task.recurrence && task.recurrenceId) {
      // 同じrecurrenceIdを持つタスクのうち、最も古いものをマスターとする
      const existing = masters.get(task.recurrenceId);
      if (!existing || new Date(task.dateISO) < new Date(existing.dateISO)) {
        masters.set(task.recurrenceId, task);
      }
    }
  });
  
  return Array.from(masters.values());
}

/**
 * 表示範囲の繰り返しタスクを自動生成してタスクリストに追加
 */
function expandRecurrenceTasks(tasks: any[], viewStartDate: Date, viewEndDate: Date): any[] {
  const masters = getRecurrenceMasters(tasks);
  const existingIds = new Set(tasks.map(t => t.id));
  const newInstances: any[] = [];

  masters.forEach(master => {
    const instances = generateRecurrenceInstances(master, viewStartDate, viewEndDate);
    
    // 既存のタスクIDと重複しないインスタンスのみ追加
    instances.forEach(instance => {
      // 同じ日時・recurrenceIdのタスクが既に存在するかチェック
      const isDuplicate = tasks.some(t => 
        t.recurrenceId === instance.recurrenceId &&
        format(parseISO(t.dateISO), "yyyy-MM-dd HH:mm") === format(parseISO(instance.dateISO), "yyyy-MM-dd HH:mm")
      );
      
      if (!isDuplicate && !existingIds.has(instance.id)) {
        newInstances.push(instance);
        existingIds.add(instance.id);
      }
    });
  });

  return [...tasks, ...newInstances];
}

// -----------------------------
// Touch gesture hook for swipe
// -----------------------------
function useSwipe(onSwipeLeft?: () => void, onSwipeRight?: () => void) {
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    const distance = touchStart.current - touchEnd.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe && onSwipeLeft) onSwipeLeft();
    if (isRightSwipe && onSwipeRight) onSwipeRight();
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}

// -----------------------------
// Components
// -----------------------------
function Login({ onLogin }: { onLogin: (user: any) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Google Sign-in
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    
    try {
      // Firebaseがまだ設定されていない場合のフォールバック
      if (typeof window !== 'undefined' && !(window as any).firebase) {
        console.warn('⚠️ Firebase not configured yet, using demo mode');
        onLogin({ 
          email: 'demo@voicetask.app', 
          name: 'Demo User',
          uid: 'demo-user-id'
        });
        return;
      }
      
      // 実際のFirebase実装はfirebase.tsから読み込む
      const { firebaseAuth } = await import('./lib/firebase');
      const { user, error: authError } = await firebaseAuth.signInWithGoogle();
      
      if (authError) {
        setError(authError);
      } else if (user) {
        onLogin({
          email: user.email,
          name: user.displayName || user.email?.split('@')[0],
          uid: user.uid,
          photoURL: user.photoURL
        });
      }
    } catch (err: any) {
      console.error('❌ Google sign-in error:', err);
      setError('Googleログインに失敗しました。デモモードで続行します。');
      // Fallback to demo mode
      onLogin({ 
        email: 'demo@voicetask.app', 
        name: 'Demo User',
        uid: 'demo-user-id'
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Email/Password Sign-in or Sign-up
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setLoading(true);
    setError("");
    
    try {
      // Firebaseがまだ設定されていない場合のフォールバック
      if (typeof window !== 'undefined' && !(window as any).firebase) {
        console.warn('⚠️ Firebase not configured yet, using demo mode');
        onLogin({ 
          email, 
          name: name || email.split('@')[0],
          uid: `demo-${email}`
        });
        return;
      }
      
      const { firebaseAuth } = await import('./lib/firebase');
      
      if (mode === 'signup') {
        const { user, error: authError } = await firebaseAuth.signUpWithEmail(email, password, name);
        if (authError) {
          setError(authError);
        } else if (user) {
          onLogin({
            email: user.email,
            name: name || user.email?.split('@')[0],
            uid: user.uid
          });
        }
      } else {
        const { user, error: authError } = await firebaseAuth.signInWithEmail(email, password);
        if (authError) {
          setError(authError);
        } else if (user) {
          onLogin({
            email: user.email,
            name: user.displayName || user.email?.split('@')[0],
            uid: user.uid
          });
        }
      }
    } catch (err: any) {
      console.error('❌ Email auth error:', err);
      setError('認証に失敗しました。デモモードで続行します。');
      // Fallback to demo mode
      onLogin({ 
        email, 
        name: name || email.split('@')[0],
        uid: `demo-${email}`
      });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-b from-indigo-50 via-fuchsia-50 to-cyan-50 p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-block w-16 h-16 rounded-3xl bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-600 text-white grid place-items-center font-bold text-2xl shadow-lg mb-4">VT</div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            {mode === 'signin' ? 'VoiceTask にログイン' : 'アカウント作成'}
          </h1>
          <p className="text-slate-600 text-sm">
            β版テスト中 - クラウド同期対応<br />
            あらゆるデバイスで使えるスケジュール管理
          </p>
        </div>
        
        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border-2 border-red-300 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}
        
        {/* Google Sign-in Button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-white border-2 border-slate-300 text-slate-700 rounded-xl py-3 font-semibold text-base mb-4 flex items-center justify-center gap-3 hover:bg-slate-50 active:scale-95 transition touch-manipulation disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Googleでログイン
        </button>
        
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-slate-500">または</span>
          </div>
        </div>
        
        {/* Email/Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium mb-2">名前</label>
              <input 
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-base focus:border-violet-500 focus:outline-none transition" 
                value={name} 
                onChange={(e)=>setName(e.target.value)} 
                placeholder="山田 太郎" 
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium mb-2">メールアドレス</label>
            <input 
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-base focus:border-violet-500 focus:outline-none transition" 
              value={email} 
              onChange={(e)=>setEmail(e.target.value)} 
              placeholder="you@example.com"
              type="email"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">パスワード</label>
            <input 
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-base focus:border-violet-500 focus:outline-none transition" 
              value={password} 
              onChange={(e)=>setPassword(e.target.value)} 
              placeholder="••••••••"
              type="password"
              required
              minLength={6}
            />
          </div>
          
          <button 
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 text-white shadow-lg transition-all hover:shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl py-4 font-semibold text-base touch-manipulation"
          >
            {loading ? '処理中...' : mode === 'signin' ? 'ログイン' : 'アカウント作成'}
          </button>
        </form>
        
        {/* Toggle Mode */}
        <div className="mt-4 text-center">
          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError("");
            }}
            className="text-sm text-violet-600 hover:text-violet-700 font-medium"
          >
            {mode === 'signin' ? 'アカウントを作成' : 'ログインに戻る'}
          </button>
        </div>
        
        <p className="text-xs text-slate-500 mt-6 text-center">
          β版テスト中: Firebase未設定の場合はデモモードで動作します<br />
          本番環境ではFirebaseの設定が必要です
        </p>
      </div>
    </div>
  );
}

function CalendarStrip({ current, onSelectDate, tasks }: { current: Date; onSelectDate: (date: Date) => void; tasks: any[] }) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(startOfToday().getTime() + i * 24*60*60*1000));
  
  const swipeHandlers = useSwipe(
    () => onSelectDate(new Date(current.getTime() + 24*60*60*1000)),
    () => onSelectDate(new Date(current.getTime() - 24*60*60*1000))
  );
  
  // 各日付のタスク数を計算
  const getTaskCount = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return tasks.filter((t: any) => {
      const taskDate = format(parseISO(t.dateISO), "yyyy-MM-dd");
      return taskDate === dateStr;
    }).length;
  };
  
  return (
    <div 
      className="flex gap-2 overflow-x-auto pb-3 px-1 snap-x snap-mandatory scrollbar-hide -mx-1"
      {...swipeHandlers}
    >
      {days.map((d) => {
        const selected = format(d, "yyyy-MM-dd") === format(current, "yyyy-MM-dd");
        const taskCount = getTaskCount(d);
        const holidayName = isHoliday(d);
        const dayOfWeek = d.getDay();
        
        return (
          <button 
            key={d.toISOString()} 
            onClick={()=>onSelectDate(d)} 
            className={classNames(
              "min-w-[80px] sm:min-w-[88px] p-3 sm:p-4 rounded-2xl border text-left snap-center flex-shrink-0 touch-manipulation transition-all",
              selected 
                ? "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 text-white border-transparent shadow-lg scale-105" 
                : holidayName
                  ? "bg-red-50 border-red-200 hover:border-red-300 hover:shadow-md active:scale-95"
                  : "bg-white border-slate-200 hover:border-violet-300 hover:shadow-md active:scale-95"
            )}
            title={holidayName || undefined}
          >
            <div className={classNames(
              "text-xs mb-1",
              selected ? "opacity-90" : (dayOfWeek === 0 || holidayName) ? "text-red-600" : dayOfWeek === 6 ? "text-blue-600" : "opacity-60"
            )}>
              {format(d, "M/d", { locale: ja })}
            </div>
            <div className={classNames(
              "text-xs font-medium mb-0.5",
              selected ? "opacity-90" : (dayOfWeek === 0 || holidayName) ? "text-red-600" : dayOfWeek === 6 ? "text-blue-600" : "opacity-60"
            )}>
              {format(d, "EEE", { locale: ja })}
              {holidayName && !selected && <span className="ml-1 text-red-600">祝</span>}
            </div>
            <div className="text-sm font-semibold">
              {isToday(d) ? "今日" : taskCount > 0 ? `予定 ${taskCount}` : "予定"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MonthCalendar({ currentDate, onSelectDate, tasks }: { currentDate: Date; onSelectDate: (date: Date) => void; tasks: any[] }) {
  const [viewMonth, setViewMonth] = useState(currentDate);
  
  // 月の最初と最後の日
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  
  // カレンダーグリッドの最初と最後（週の開始・終了を含む）
  const calendarStart = startOfWeek(monthStart, { locale: ja });
  const calendarEnd = endOfWeek(monthEnd, { locale: ja });
  
  // すべての日付を取得
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  // 各日付のタスク数を計算
  const getTaskCount = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return tasks.filter((t: any) => {
      const taskDate = format(parseISO(t.dateISO), "yyyy-MM-dd");
      return taskDate === dateStr;
    }).length;
  };
  
  // 前月・次月に移動
  const goToPrevMonth = () => setViewMonth(prev => addMonths(prev, -1));
  const goToNextMonth = () => setViewMonth(prev => addMonths(prev, 1));
  const goToToday = () => {
    const today = new Date();
    setViewMonth(today);
    onSelectDate(today);
  };
  
  return (
    <div className="bg-white border-2 border-slate-200 rounded-2xl shadow-lg p-4">
      {/* ヘッダー: 月表示と操作ボタン */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={goToPrevMonth}
          className="w-10 h-10 rounded-lg border-2 border-slate-300 hover:bg-slate-50 active:bg-slate-100 transition flex items-center justify-center touch-manipulation"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <span className="text-xl">←</span>
        </button>
        
        <div className="flex items-center gap-2">
          <div className="text-lg font-bold text-slate-800">
            {format(viewMonth, "yyyy年M月", { locale: ja })}
          </div>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-xs rounded-lg border-2 border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 active:bg-violet-200 transition touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            今日
          </button>
        </div>
        
        <button
          onClick={goToNextMonth}
          className="w-10 h-10 rounded-lg border-2 border-slate-300 hover:bg-slate-50 active:bg-slate-100 transition flex items-center justify-center touch-manipulation"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <span className="text-xl">→</span>
        </button>
      </div>
      
      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {["日", "月", "火", "水", "木", "金", "土"].map((day, i) => (
          <div key={day} className={classNames(
            "text-center text-xs font-semibold py-2",
            i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-slate-600"
          )}>
            {day}
          </div>
        ))}
      </div>
      
      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, viewMonth);
          const isSelected = isSameDay(day, currentDate);
          const isTodayDate = isToday(day);
          const taskCount = getTaskCount(day);
          const dayOfWeek = day.getDay();
          const holidayName = isHoliday(day);
          
          return (
            <button
              key={day.toISOString()}
              onClick={() => {
                onSelectDate(day);
                setViewMonth(day); // 月表示も更新
              }}
              className={classNames(
                "aspect-square p-1 rounded-lg text-center transition-all touch-manipulation relative",
                isSelected
                  ? "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 text-white shadow-lg scale-105"
                  : isTodayDate
                    ? "bg-violet-100 border-2 border-violet-500 text-violet-900 font-semibold"
                    : holidayName
                      ? "bg-red-50 border-2 border-red-200 hover:bg-red-100"
                      : taskCount > 0
                        ? "bg-fuchsia-50 border-2 border-fuchsia-200 hover:bg-fuchsia-100"
                        : "bg-white border border-slate-200 hover:bg-slate-50",
                !isCurrentMonth && "opacity-30",
                "flex flex-col items-center justify-center"
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
              title={holidayName || undefined}
            >
              <div className={classNames(
                "text-sm font-medium",
                !isCurrentMonth && "text-slate-400",
                isSelected && "text-white",
                !isSelected && (dayOfWeek === 0 || holidayName) && "text-red-600",
                !isSelected && dayOfWeek === 6 && !holidayName && "text-blue-600"
              )}>
                {format(day, "d")}
              </div>
              {holidayName && !isSelected && (
                <div className="text-[8px] font-semibold mt-0.5 text-red-600 leading-none">
                  祝
                </div>
              )}
              {taskCount > 0 && (
                <div className={classNames(
                  "text-[10px] font-semibold mt-0.5",
                  isSelected ? "text-white" : "text-fuchsia-600"
                )}>
                  {taskCount}件
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VoiceCapture({ onText, selectedDate, onDateSelect }: { onText: (text: string, targetDate: Date) => void; selectedDate: Date; onDateSelect: (date: Date) => void }) {
  const [recording, setRecording] = useState(false);
  const recRef = useRef<any>(null);
  const [supported, setSupported] = useState(false);
  const [lastText, setLastText] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  
  // デバッグ: lastTextの変化を監視
  useEffect(() => {
    console.log('📝 lastText更新:', {
      value: lastText,
      trimmed: lastText.trim(),
      length: lastText.trim().length,
      isDisabled: !lastText.trim()
    });
  }, [lastText]);

  useEffect(() => {
    // iOS Safari対応: webkitSpeechRecognitionを優先的にチェック
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    
    console.log('🎤 音声認識チェック:', {
      userAgent: navigator.userAgent,
      webkitSpeechRecognition: !!(window as any).webkitSpeechRecognition,
      SpeechRecognition: !!(window as any).SpeechRecognition,
      available: !!SR,
      isIOS: /iPhone|iPad|iPod/.test(navigator.userAgent),
      isSafari: /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
    });
    
    if (SR) {
      setSupported(true);
      const rec = new SR();
      rec.lang = "ja-JP";
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      
      rec.onstart = () => {
        console.log('🎙️ 録音開始成功');
        setIsListening(true);
        setErrorMessage("");
        setRecording(true);
      };
      
      rec.onresult = (e: any) => {
        console.log('📝 音声認識結果:', e.results);
        const t = Array.from(e.results)
          .map((r: any) => r[0]?.transcript)
          .join(" ");
        console.log('✅ 変換されたテキスト:', t);
        setLastText(t);
      };
      
      rec.onerror = (e: any) => {
        console.error('❌ 音声認識エラー:', e.error, e);
        setRecording(false);
        setIsListening(false);
        
        // エラーメッセージをユーザーフレンドリーに
        let userMessage = "";
        switch(e.error) {
          case 'not-allowed':
          case 'permission-denied':
            userMessage = "マイクへのアクセスが拒否されました。\n設定からマイクの許可を有効にしてください。";
            break;
          case 'no-speech':
            userMessage = "音声が検出されませんでした。\nもう一度お試しください。";
            break;
          case 'aborted':
            userMessage = "音声認識が中断されました。";
            break;
          case 'network':
            userMessage = "ネットワークエラーが発生しました。\n接続を確認してください。";
            break;
          default:
            userMessage = `音声認識エラー: ${e.error}\n手入力をご利用ください。`;
        }
        setErrorMessage(userMessage);
        
        // iOS Safari特有のエラーハンドリング
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
          console.warn('📱 iOS環境でのエラー検出');
        }
      };
      
      rec.onend = () => {
        console.log('⏹️ 録音終了');
        setRecording(false);
        setIsListening(false);
      };
      
      recRef.current = rec;
    } else {
      console.warn('⚠️ 音声認識はこのブラウザでサポートされていません');
      setErrorMessage("このブラウザは音声認識に対応していません。\niPhone/iPadの場合はSafariブラウザをご利用ください。");
    }
  }, []);

  const handleStartRecording = async () => {
    console.log('🔘 録音開始処理');
    setErrorMessage("");
    
    if (!supported) {
      console.warn('⚠️ 音声認識非対応');
      setErrorMessage('このブラウザは音声認識に対応していません。\n手入力をご利用ください。');
      setIsExpanded(true);
      return;
    }
    
    // iOS Safari: ユーザーインタラクションから直接実行する必要がある
    try {
      // マイク権限の事前確認（可能な場合）
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          console.log('🎤 マイク権限状態:', permissionStatus.state);
          
          if (permissionStatus.state === 'denied') {
            setErrorMessage('マイクへのアクセスが拒否されています。\n設定からマイクの許可を有効にしてください。');
            return;
          }
        } catch (e) {
          // permissions APIがサポートされていない場合（iOS Safari等）
          console.log('ℹ️ Permissions APIは利用できません（iOS Safari等）');
        }
      }
      
      setLastText("");
      setRecording(true);
      setIsListening(false);
      
      console.log('▶️ 音声認識を開始します...');
      console.log('📱 デバイス情報:', {
        isIOS: /iPhone|iPad|iPod/.test(navigator.userAgent),
        isSafari: /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent),
        userAgent: navigator.userAgent
      });
      
      // 短いディレイを入れてUIの更新を確実にする（iOS対策）
      await new Promise(resolve => setTimeout(resolve, 100));
      
      recRef.current?.start();
      console.log('✅ start()メソッド呼び出し完了');
      
    } catch (error: any) {
      console.error('❌ 音声認識開始エラー:', error);
      setRecording(false);
      setIsListening(false);
      
      let userMessage = '音声認識の開始に失敗しました。\n';
      if (error.name === 'InvalidStateError') {
        userMessage += '音声認識が既に実行中です。\n少し待ってから再度お試しください。';
      } else {
        userMessage += '手入力をご利用ください。';
      }
      setErrorMessage(userMessage);
    }
  };
  
  const handleStopRecording = () => {
    console.log('⏹️ 録音停止処理');
    setErrorMessage("");
    
    try {
      recRef.current?.stop();
      console.log('✅ 音声認識を停止');
    } catch (error) {
      console.error('❌ 音声認識停止エラー:', error);
      setErrorMessage('音声認識の停止に失敗しました。');
    } finally {
      setRecording(false);
      setIsListening(false);
    }
  };

  return (
    <div className="bg-white/90 border-2 border-slate-200 rounded-2xl shadow-lg backdrop-blur-sm">
      <div className="p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-base flex items-center gap-2">
              <span className="text-2xl">📝</span>
              <span>予定を追加</span>
              {recording && <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
              {isListening && <span className="text-xs text-red-500 font-medium">🔴 聞いています</span>}
            </div>
            <div className="text-xs text-slate-600 mt-1">
              {recording 
                ? isListening 
                  ? "🎙️ 録音中... 話してください" 
                  : "🎙️ マイクを起動中..."
                : supported 
                  ? "音声入力または手入力で予定を追加" 
                  : "手入力で予定を追加"}
            </div>
          </div>
          
          {/* Recording Button - iOS Compatible */}
          {supported && !recording && (
            <div 
              onClick={handleStartRecording}
              className="flex-shrink-0 w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 shadow-2xl cursor-pointer select-none relative"
              style={{ 
                WebkitTapHighlightColor: 'rgba(0,0,0,0)',
                touchAction: 'manipulation',
                userSelect: 'none',
                WebkitUserSelect: 'none'
              }}
            >
              <div className="w-full h-full rounded-full flex items-center justify-center active:scale-95 transition-transform">
                <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </div>
              {/* タップヒント */}
              <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-slate-500 whitespace-nowrap">
                タップ
              </div>
            </div>
          )}
          
          {/* Stop Recording Button with Enhanced Visual Feedback */}
          {recording && (
            <div 
              onClick={handleStopRecording}
              className="flex-shrink-0 w-20 h-20 rounded-full bg-red-500 shadow-2xl cursor-pointer select-none relative"
              style={{ 
                WebkitTapHighlightColor: 'rgba(0,0,0,0)',
                touchAction: 'manipulation',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'
              }}
            >
              {/* Listening Animation Ring */}
              {isListening && (
                <div className="absolute inset-0 rounded-full border-4 border-red-300 animate-ping"></div>
              )}
              
              <div className="w-full h-full rounded-full flex items-center justify-center active:scale-95 transition-transform relative z-10">
                <div className="w-8 h-8 bg-white rounded-md"></div>
              </div>
              
              {/* Stop Hint */}
              <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-red-600 whitespace-nowrap font-semibold">
                {isListening ? "話してください" : "起動中..."}
              </div>
            </div>
          )}
        </div>
      
        <div className="space-y-3">
          {/* エラーメッセージ表示 */}
          {errorMessage && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 text-sm text-red-700 whitespace-pre-line">
              <div className="font-semibold mb-1">⚠️ エラー</div>
              {errorMessage}
            </div>
          )}
          
          {/* 成功時のフィードバック */}
          {!recording && lastText && !errorMessage && (
            <div className="bg-green-50 border-2 border-green-300 rounded-xl p-3 text-sm text-green-700">
              <div className="font-semibold mb-1">✅ 音声認識成功</div>
              認識されたテキストを確認して登録してください
            </div>
          )}
          
          <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3">
            💡 音声または手入力で内容を入力後、カレンダーから日付を選んで登録してください
            <br />
            <span className="text-xs text-slate-500 mt-1 block">
              📱 iPhoneの場合: マイクボタンをタップ後、「許可」を選択してください
            </span>
          </div>
          
          <textarea 
            className="w-full border-2 border-slate-200 rounded-xl p-3 text-base focus:border-violet-500 focus:outline-none transition resize-none" 
            rows={4} 
            placeholder="予定の内容を入力してください&#10;例: 10時 会議 1時間" 
            value={lastText} 
            onChange={(e)=>setLastText(e.target.value)} 
          />
          
          {/* 選択中の日付表示と変更 */}
          {lastText.trim().length > 0 && (
            <div className="bg-gradient-to-r from-fuchsia-50 via-violet-50 to-indigo-50 border-2 border-violet-300 rounded-xl p-4">
              <div className="text-sm font-medium text-slate-700 mb-3">
                📅 登録先の日付
              </div>
              <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 mb-3">
                {format(selectedDate, "M月d日(EEE)", { locale: ja })}
                {isToday(selectedDate) && <span className="ml-2 text-base">(今日)</span>}
              </div>
              
              {/* 日付選択ボタン */}
              <div className="flex gap-2 flex-wrap">
                {/* 今日ボタン */}
                <button
                  type="button"
                  onClick={() => onDateSelect(new Date())}
                  className={classNames(
                    "flex-1 min-w-[100px] px-3 py-2 rounded-lg font-medium transition touch-manipulation text-sm",
                    isToday(selectedDate)
                      ? "bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white shadow-md"
                      : "bg-white border-2 border-violet-300 text-violet-700 hover:bg-violet-50 active:bg-violet-100"
                  )}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  📍 今日
                </button>
                
                {/* 明日ボタン */}
                <button
                  type="button"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    onDateSelect(tomorrow);
                  }}
                  className={classNames(
                    "flex-1 min-w-[100px] px-3 py-2 rounded-lg font-medium transition touch-manipulation text-sm",
                    isTomorrow(selectedDate)
                      ? "bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white shadow-md"
                      : "bg-white border-2 border-violet-300 text-violet-700 hover:bg-violet-50 active:bg-violet-100"
                  )}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  🔜 明日
                </button>
                
                {/* 来週ボタン */}
                <button
                  type="button"
                  onClick={() => {
                    const nextWeek = new Date();
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    onDateSelect(nextWeek);
                  }}
                  className="flex-1 min-w-[100px] px-3 py-2 rounded-lg border-2 border-violet-300 bg-white text-violet-700 font-medium hover:bg-violet-50 active:bg-violet-100 transition touch-manipulation text-sm"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  📆 来週
                </button>
              </div>
              
              <div className="text-xs text-slate-600 mt-3 bg-white/50 rounded-lg p-2">
                💡 上のカレンダーをタップして、他の日付を選ぶこともできます
              </div>
            </div>
          )}
          
          <div className="flex gap-2">
            <button 
              type="button"
              onClick={()=>{ 
                console.log('➕ 追加ボタンクリック');
                console.log('  - lastText:', lastText);
                console.log('  - selectedDate:', format(selectedDate, "yyyy-MM-dd", { locale: ja }));
                const trimmedText = lastText.trim();
                if (trimmedText) {
                  console.log('✅ テキストを追加:', trimmedText);
                  onText(trimmedText, selectedDate); 
                  setLastText(""); 
                } else {
                  console.warn('⚠️ テキストが空です');
                }
              }}
              disabled={lastText.trim().length === 0}
              className={classNames(
                "flex-1 min-h-[52px] px-4 py-3 rounded-xl font-semibold shadow-lg transition-all touch-manipulation text-base",
                lastText.trim().length > 0
                  ? "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 text-white hover:shadow-xl active:scale-95 cursor-pointer"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed opacity-50"
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              📌 この日付に追加 {lastText.trim().length > 0 ? '✓' : ''}
            </button>
            <button 
              type="button"
              onClick={()=>{ 
                console.log('🗑️ クリアボタンクリック');
                setLastText(""); 
              }} 
              className="min-h-[52px] px-4 py-3 rounded-xl border-2 border-slate-300 font-medium hover:bg-slate-50 active:scale-95 touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              クリア
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskItem({ task, onToggle, onDelete, onToggleNotify, onUpdate }: any) {
  const when = new Date(task.dateISO);
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className={classNames(
      "bg-white border-2 rounded-xl shadow-sm overflow-hidden transition-all",
      task.done ? "opacity-60 border-slate-200" : "border-slate-300",
      isExpanded ? "shadow-lg" : ""
    )}>
      <div 
        className="p-4 cursor-pointer touch-manipulation"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
            className="flex-shrink-0 mt-0.5 touch-manipulation"
          >
            <div className={classNames(
              "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
              task.done 
                ? "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 border-transparent" 
                : "border-slate-400 hover:border-violet-500"
            )}>
              {task.done && <span className="text-white text-sm">✓</span>}
            </div>
          </button>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1">
              <div className={classNames(
                "font-medium text-base break-words flex-1",
                task.done && "line-through"
              )}>
                {task.title}
              </div>
              {task.priority === "high" && (
                <span className="flex-shrink-0 text-xs px-2 py-1 rounded-full bg-fuchsia-100 text-fuchsia-700 font-medium">
                  重要
                </span>
              )}
            </div>
            
            <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
              <span>📅 {format(when, "M/d(EEE) H:mm", { locale: ja })}</span>
              <span>⏱️ {task.durationMin}分</span>
              {task.notify && <span>🔔 通知ON</span>}
              {task.recurrence && (
                <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                  🔄 {
                    task.recurrence.frequency === 'daily' ? '毎日' :
                    task.recurrence.frequency === 'weekly' ? '毎週' :
                    task.recurrence.frequency === 'monthly' ? '毎月' :
                    '繰り返し'
                  }
                </span>
              )}
            </div>
            
            {/* タグ表示 */}
            {task.tags && task.tags.length > 0 && (
              <div className="text-xs flex flex-wrap items-center gap-2">
                {task.tags.map((tag: string) => (
                  <span key={tag} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          
          <button 
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 active:bg-slate-200 transition touch-manipulation"
          >
            <span className={classNames("transition-transform", isExpanded && "rotate-180")}>
              ▼
            </span>
          </button>
        </div>
      </div>
      
      {isExpanded && task.note && (
        <div className="px-4 pb-3">
          <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 break-words">
            {task.note}
          </div>
        </div>
      )}
      
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-200 pt-3">
          {/* リマインダー設定 */}
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <div className="text-sm font-semibold text-slate-700 mb-2">🔔 リマインダー</div>
            <label className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg border-2 border-slate-300 bg-white cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition touch-manipulation">
              <input 
                type="checkbox" 
                checked={task.notify} 
                onChange={()=>onToggleNotify(task.id)} 
                className="w-5 h-5"
              />
              <span className="text-sm font-medium">通知を有効にする</span>
            </label>
            {task.notify && (
              <div className="text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded-lg p-2">
                💡 タスク開始時刻の10分前に通知されます
              </div>
            )}
          </div>

          {/* 繰り返し設定 */}
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <div className="text-sm font-semibold text-slate-700 mb-2">🔄 繰り返し</div>
            {task.recurrence ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-violet-50 border-2 border-violet-300 rounded-lg p-3">
                  <div className="text-sm">
                    <div className="font-medium text-violet-700">
                      {task.recurrence.frequency === 'daily' && `${task.recurrence.interval}日ごと`}
                      {task.recurrence.frequency === 'weekly' && (
                        task.recurrence.daysOfWeek && task.recurrence.daysOfWeek.length > 0
                          ? `毎週 ${task.recurrence.daysOfWeek.map((d: number) => ['日','月','火','水','木','金','土'][d]).join('・')}`
                          : `${task.recurrence.interval}週間ごと`
                      )}
                      {task.recurrence.frequency === 'monthly' && (
                        task.recurrence.dayOfMonth 
                          ? `毎月${task.recurrence.dayOfMonth}日`
                          : `${task.recurrence.interval}ヶ月ごと`
                      )}
                      {task.recurrence.frequency === 'yearly' && `${task.recurrence.interval}年ごと`}
                    </div>
                    {task.recurrence.endDate && (
                      <div className="text-xs text-slate-600 mt-1">
                        終了日: {format(parseISO(task.recurrence.endDate), 'M/d(EEE)', { locale: ja })}
                      </div>
                    )}
                    {task.recurrence.count && (
                      <div className="text-xs text-slate-600 mt-1">
                        残り {task.recurrence.count} 回
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onUpdate(task.id, { recurrence: undefined, recurrenceId: undefined })}
                    className="flex-shrink-0 px-3 py-1.5 text-xs rounded-lg border-2 border-red-300 text-red-600 font-medium hover:bg-red-50 active:bg-red-100 transition touch-manipulation"
                  >
                    解除
                  </button>
                </div>
                {task.recurrenceId && (
                  <div className="text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded-lg p-2">
                    💡 このタスクは繰り返しタスクの一部です。完了すると次回のタスクが自動生成されます。
                  </div>
                )}
              </div>
            ) : (
              <details className="bg-white rounded-lg border-2 border-slate-300">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition touch-manipulation list-none">
                  <div className="flex items-center justify-between">
                    <span>繰り返しを設定</span>
                    <span className="text-slate-400">▼</span>
                  </div>
                </summary>
                <div className="p-3 space-y-2 border-t border-slate-200">
                  <button
                    onClick={() => onUpdate(task.id, { 
                      recurrence: { frequency: 'daily', interval: 1 }
                    })}
                    className="w-full text-left px-3 py-2 rounded-lg border-2 border-slate-300 hover:bg-slate-50 active:bg-slate-100 transition text-sm touch-manipulation"
                  >
                    📅 毎日
                  </button>
                  <button
                    onClick={() => {
                      const dayOfWeek = new Date(task.dateISO).getDay();
                      onUpdate(task.id, { 
                        recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [dayOfWeek] }
                      });
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg border-2 border-slate-300 hover:bg-slate-50 active:bg-slate-100 transition text-sm touch-manipulation"
                  >
                    📅 毎週 {['日','月','火','水','木','金','土'][new Date(task.dateISO).getDay()]}曜日
                  </button>
                  <button
                    onClick={() => onUpdate(task.id, { 
                      recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [1,2,3,4,5] }
                    })}
                    className="w-full text-left px-3 py-2 rounded-lg border-2 border-slate-300 hover:bg-slate-50 active:bg-slate-100 transition text-sm touch-manipulation"
                  >
                    📅 毎週 平日（月〜金）
                  </button>
                  <button
                    onClick={() => {
                      const dayOfMonth = new Date(task.dateISO).getDate();
                      onUpdate(task.id, { 
                        recurrence: { frequency: 'monthly', interval: 1, dayOfMonth }
                      });
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg border-2 border-slate-300 hover:bg-slate-50 active:bg-slate-100 transition text-sm touch-manipulation"
                  >
                    📅 毎月 {new Date(task.dateISO).getDate()}日
                  </button>
                  <button
                    onClick={() => onUpdate(task.id, { 
                      recurrence: { frequency: 'yearly', interval: 1 }
                    })}
                    className="w-full text-left px-3 py-2 rounded-lg border-2 border-slate-300 hover:bg-slate-50 active:bg-slate-100 transition text-sm touch-manipulation"
                  >
                    📅 毎年
                  </button>
                </div>
              </details>
            )}
          </div>

          {/* アクション */}
          <div className="flex gap-2">
            <button 
              onClick={()=>onDelete(task.id)} 
              className="flex-1 min-h-[44px] px-4 py-2 rounded-lg border-2 border-red-300 text-red-600 font-medium hover:bg-red-50 active:bg-red-100 transition touch-manipulation"
            >
              削除
            </button>
            <button 
              onClick={() => {
                downloadICalendar([task], `${task.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`);
                alert('この予定をカレンダー形式でエクスポートしました！');
              }}
              className="flex-1 min-h-[44px] px-4 py-2 rounded-lg border-2 border-violet-300 bg-violet-50 text-violet-700 font-medium hover:bg-violet-100 active:bg-violet-200 transition touch-manipulation text-sm"
            >
              📅 エクスポート
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Dashboard({ user, onLogout }: any) {
  const [currentDate, setCurrentDate] = useState(startOfToday());
  const [tasks, setTasks] = useState<any[]>([]);
  const [filterTodayOnly, setFilterTodayOnly] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week'); // カレンダー表示モード
  const [tasksLoading, setTasksLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  // プッシュ通知関連のステート
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [notificationSetupLoading, setNotificationSetupLoading] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  
  // Google Calendar連携のステート
  const [googleCalendarEnabled, setGoogleCalendarEnabled] = useState(false);
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);
  
  // 同期ステータスのステート
  const [isSynced, setIsSynced] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Firestore リアルタイム同期
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const setupFirestoreSync = async () => {
      // userにuidがあるかチェック（Firebase認証済みの場合）
      if (!user.uid) {
        console.warn('⚠️ Firebase未認証、LocalStorageを使用');
        setTasks(loadTasks(user.email));
        setTasksLoading(false);
        return;
      }

      try {
        const { firebaseDb } = await import('./lib/firebase');
        
        console.log('🔄 Firestoreリアルタイム同期開始:', user.uid);
        
        // リアルタイム同期のセットアップ
        unsubscribe = firebaseDb.tasks.subscribe(user.uid, (updatedTasks) => {
          console.log('📥 Firestoreからタスク受信:', updatedTasks.length, '件');
          setTasks(updatedTasks);
          setTasksLoading(false);
          setSyncError(null);
        });

        // 初回読み込み時にLocalStorageデータを移行
        const localTasks = loadTasks(user.email);
        if (localTasks.length > 0) {
          console.log('📤 LocalStorageデータをFirestoreに移行:', localTasks.length, '件');
          
          // 既存のFirestoreデータを確認
          const firestoreTasks = await firebaseDb.tasks.getAll(user.uid);
          
          if (firestoreTasks.length === 0) {
            // Firestoreが空の場合のみ移行
            for (const task of localTasks) {
              await firebaseDb.tasks.add(user.uid, task);
            }
            console.log('✅ LocalStorageデータ移行完了');
            
            // 移行後はLocalStorageをクリア
            localStorage.removeItem(KEY(user.email));
          }
        }
      } catch (error) {
        console.error('❌ Firestore同期エラー:', error);
        setSyncError('データの同期に失敗しました。ローカルモードで動作します。');
        setTasks(loadTasks(user.email));
        setTasksLoading(false);
      }
    };

    setupFirestoreSync();

    return () => {
      if (unsubscribe) {
        console.log('🔌 Firestore同期解除');
        unsubscribe();
      }
    };
  }, [user.uid, user.email]);
  
  // 同期ステータスの監視
  useEffect(() => {
    let unsubscribeSyncStatus: (() => void) | undefined;
    
    const setupSyncMonitoring = async () => {
      if (!user.uid) return;
      
      try {
        const { firebaseDb } = await import('./lib/firebase');
        
        // 同期ステータスの監視を開始
        unsubscribeSyncStatus = firebaseDb.connection.onSyncStatusChange((synced) => {
          setIsSynced(synced);
          if (synced) {
            setLastSyncTime(new Date());
          }
        });
      } catch (error) {
        console.error('❌ 同期ステータス監視エラー:', error);
      }
    };
    
    setupSyncMonitoring();
    
    return () => {
      if (unsubscribeSyncStatus) {
        unsubscribeSyncStatus();
      }
    };
  }, [user.uid]);

  // LocalStorageへの保存（Firestore非対応時のフォールバック）
  useEffect(() => {
    if (!user.uid) {
      saveTasks(user.email, tasks);
    }
  }, [tasks, user.email, user.uid]);

  // プッシュ通知のセットアップ
  useEffect(() => {
    const setupNotifications = async () => {
      // 通知権限の初期状態を取得
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
        
        // 権限がまだリクエストされていない場合、プロンプトを表示
        if (Notification.permission === 'default' && user.uid) {
          // 初回訪問から少し遅れて表示（UX改善）
          setTimeout(() => {
            setShowNotificationPrompt(true);
          }, 3000);
        }
      }

      // Service Workerの登録
      try {
        const { serviceWorkerManager } = await import('./lib/serviceWorker');
        const { registration, error } = await serviceWorkerManager.register();
        
        if (error) {
          console.warn('⚠️ Service Worker登録失敗:', error);
        } else {
          console.log('✅ Service Worker登録成功');
        }
      } catch (error) {
        console.warn('⚠️ Service Worker初期化エラー:', error);
      }

      // フォアグラウンド通知のリスナー設定
      try {
        const { firebaseMessaging } = await import('./lib/firebase');
        
        const unsubscribe = firebaseMessaging.onForegroundMessage((payload) => {
          console.log('📬 フォアグラウンド通知受信:', payload);
          
          // ブラウザ通知を表示
          if (Notification.permission === 'granted') {
            new Notification(
              payload.notification?.title || 'VoiceTask 通知',
              {
                body: payload.notification?.body || '新しい通知があります',
                icon: '/icon-192x192.png',
                tag: payload.data?.taskId
              }
            );
          }
        });

        return () => {
          if (unsubscribe) unsubscribe();
        };
      } catch (error) {
        console.warn('⚠️ Firebase Messaging初期化エラー:', error);
      }
    };

    setupNotifications();
  }, [user.uid]);

  useEffect(() => {
    ensureNotificationPermission();
    // schedule future notifs for existing tasks
    tasks.forEach((t: any)=>{
      clearNotification(t.id);
      if (isAfter(new Date(t.dateISO), new Date())) scheduleNotification(t);
    });
    return () => tasks.forEach((t: any)=>clearNotification(t.id));
  }, []);

  // 繰り返しタスクを展開（表示範囲の3ヶ月分）
  const expandedTasks = useMemo(() => {
    const now = new Date();
    const viewStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); // 先月から
    const viewEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0); // 再来月末まで
    
    return expandRecurrenceTasks(tasks, viewStart, viewEnd);
  }, [tasks]);

  const todays = useMemo(() => {
    const filtered = expandedTasks.filter((t: any) => {
      const taskDate = format(parseISO(t.dateISO), "yyyy-MM-dd");
      const currDate = format(currentDate, "yyyy-MM-dd");
      return taskDate === currDate;
    });
    console.log('📅 今日の予定フィルター:', {
      currentDate: format(currentDate, "yyyy-MM-dd", { locale: ja }),
      allTasks: expandedTasks.length,
      todayTasks: filtered.length,
      tasks: filtered.map((t: any) => ({
        title: t.title,
        date: format(parseISO(t.dateISO), "yyyy-MM-dd HH:mm", { locale: ja }),
        recurrence: t.recurrence ? `繰り返し: ${t.recurrence.frequency}` : 'なし'
      }))
    });
    return filtered;
  }, [expandedTasks, currentDate]);
  
  const upcoming = useMemo(() => expandedTasks
    .filter((t: any) => !t.done && isAfter(new Date(t.dateISO), new Date()))
    .sort((a: any, b: any)=> new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime())
    .slice(0, 5)
  , [expandedTasks]);

  async function addFromText(text: string, targetDate: Date) {
    const task = parseVoiceTextToTask(text, targetDate);
    console.log('📝 新しいタスク作成:', {
      text,
      targetDate: format(targetDate, "yyyy-MM-dd", { locale: ja }),
      task,
      dateISO: task.dateISO,
      date: new Date(task.dateISO),
      formatted: format(new Date(task.dateISO), "yyyy-MM-dd HH:mm", { locale: ja })
    });

    // Google Calendar連携
    if (googleCalendarEnabled) {
      try {
        const { googleCalendar } = await import('./lib/googleCalendar');
        const result = await googleCalendar.createEvent(task);
        if (result.success && result.eventId) {
          task.googleCalendarEventId = result.eventId;
          console.log('✅ Google Calendarにイベント追加:', result.eventId);
        }
      } catch (error) {
        console.error('❌ Google Calendar連携エラー:', error);
        // エラーがあってもタスク作成は続行
      }
    }

    // Firestore対応チェック
    if (user.uid) {
      try {
        const { firebaseDb } = await import('./lib/firebase');
        await firebaseDb.tasks.add(user.uid, task);
        console.log('✅ タスクをFirestoreに追加:', task.id);
        
        // schedule notif for new task
        if (task.notify) scheduleNotification(task);
        
        // リアルタイム同期で自動更新されるため、setTasksは不要
      } catch (error) {
        console.error('❌ Firestoreへの追加エラー:', error);
        // フォールバック: ローカルで追加
        setTasks((prev: any) => {
          const next = [task, ...prev];
          if (task.notify) scheduleNotification(task);
          return next;
        });
      }
    } else {
      // LocalStorage mode
      setTasks((prev: any) => {
        const next = [task, ...prev];
        console.log('📋 タスクリスト更新:', next.length, '件');
        if (task.notify) scheduleNotification(task);
        return next;
      });
    }
  }

  async function toggleDone(id: string) {
    const task = tasks.find((t: any) => t.id === id);
    if (!task) return;

    const newDoneState = !task.done;

    if (user.uid) {
      try {
        const { firebaseDb } = await import('./lib/firebase');
        await firebaseDb.tasks.update(id, { done: newDoneState });
        console.log('✅ タスク完了状態をFirestoreで更新:', id, newDoneState);
      } catch (error) {
        console.error('❌ Firestore更新エラー:', error);
        // フォールバック: ローカルで更新
        setTasks((prev: any) => prev.map((t: any) => t.id === id ? { ...t, done: newDoneState } : t));
      }
    } else {
      // LocalStorage mode
      setTasks((prev: any) => prev.map((t: any) => t.id === id ? { ...t, done: newDoneState } : t));
    }
  }
  
  async function toggleNotify(id: string) {
    const task = tasks.find((t: any) => t.id === id);
    if (!task) return;

    const newNotifyState = !task.notify;
    clearNotification(id);

    if (user.uid) {
      try {
        const { firebaseDb } = await import('./lib/firebase');
        await firebaseDb.tasks.update(id, { notify: newNotifyState });
        console.log('✅ タスク通知状態をFirestoreで更新:', id, newNotifyState);
        
        if (newNotifyState) {
          const updatedTask = { ...task, notify: newNotifyState };
          scheduleNotification(updatedTask);
        }
      } catch (error) {
        console.error('❌ Firestore更新エラー:', error);
        // フォールバック: ローカルで更新
        setTasks((prev: any) => prev.map((t: any) => {
          if (t.id !== id) return t;
          const next = { ...t, notify: newNotifyState };
          if (next.notify) scheduleNotification(next);
          return next;
        }));
      }
    } else {
      // LocalStorage mode
      setTasks((prev: any) => prev.map((t: any) => {
        if (t.id !== id) return t;
        const next = { ...t, notify: newNotifyState };
        if (next.notify) scheduleNotification(next);
        return next;
      }));
    }
  }
  
  async function updateTask(id: string, updates: Partial<any>) {
    const task = tasks.find((t: any) => t.id === id);
    if (!task) return;

    // Google Calendar連携
    if (googleCalendarEnabled && task.googleCalendarEventId) {
      try {
        const { googleCalendar } = await import('./lib/googleCalendar');
        const updatedTask = { ...task, ...updates };
        await googleCalendar.updateEvent(task.googleCalendarEventId, updatedTask);
        console.log('✅ Google Calendarイベント更新:', task.googleCalendarEventId);
      } catch (error) {
        console.error('❌ Google Calendar更新エラー:', error);
      }
    }

    if (user.uid) {
      try {
        const { firebaseDb } = await import('./lib/firebase');
        await firebaseDb.tasks.update(id, updates);
        console.log('✅ タスクをFirestoreで更新:', id, updates);
        
        // 繰り返し設定が追加された場合、次回インスタンスを生成
        if (updates.recurrence && !task.recurrence) {
          const updatedTask = { ...task, ...updates };
          const nextInstances = generateRecurrenceInstances(updatedTask, 1);
          if (nextInstances.length > 0) {
            const nextTask = nextInstances[0];
            await firebaseDb.tasks.add(user.uid, nextTask);
            console.log('✅ 次回の繰り返しタスクを生成:', nextTask);
          }
        }
      } catch (error) {
        console.error('❌ Firestore更新エラー:', error);
        // フォールバック: ローカルで更新
        setTasks((prev: any) => prev.map((t: any) => t.id === id ? { ...t, ...updates } : t));
      }
    } else {
      // LocalStorage mode
      setTasks((prev: any) => prev.map((t: any) => t.id === id ? { ...t, ...updates } : t));
    }
  }
  
  async function remove(id: string) {
    const task = tasks.find((t: any) => t.id === id);
    clearNotification(id);

    // Google Calendar連携
    if (googleCalendarEnabled && task?.googleCalendarEventId) {
      try {
        const { googleCalendar } = await import('./lib/googleCalendar');
        await googleCalendar.deleteEvent(task.googleCalendarEventId);
        console.log('✅ Google Calendarイベント削除:', task.googleCalendarEventId);
      } catch (error) {
        console.error('❌ Google Calendar削除エラー:', error);
      }
    }

    if (user.uid) {
      try {
        const { firebaseDb } = await import('./lib/firebase');
        await firebaseDb.tasks.delete(id);
        console.log('✅ タスクをFirestoreから削除:', id);
      } catch (error) {
        console.error('❌ Firestore削除エラー:', error);
        // フォールバック: ローカルで削除
        setTasks((prev: any) => prev.filter((t: any) => t.id !== id));
      }
    } else {
      // LocalStorage mode
      setTasks((prev: any) => prev.filter((t: any) => t.id !== id));
    }
  }

  // プッシュ通知のセットアップ（FCMトークン取得とFirestoreへの保存）
  async function setupPushNotifications() {
    if (!user.uid) {
      alert('❌ プッシュ通知を有効にするには、ログインが必要です');
      return;
    }

    setNotificationSetupLoading(true);

    try {
      console.log('🔄 プッシュ通知のセットアップを開始します...');
      const { firebaseMessaging } = await import('./lib/firebase');
      
      // VAPID Keyを取得（環境変数から）
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      
      console.log('🔍 VAPID Key チェック:', vapidKey ? '✅ 設定済み' : '❌ 未設定');
      
      if (!vapidKey || vapidKey === 'your_vapid_key_here') {
        alert('❌ Firebase Cloud Messagingが設定されていません\n\n環境変数 VITE_FIREBASE_VAPID_KEY を設定してください。\n\n【対処方法】\n1. Firebaseコンソールでプロジェクト設定を開く\n2. Cloud Messaging タブでVAPIキーを取得\n3. Cloudflare Pagesの環境変数に追加');
        setNotificationSetupLoading(false);
        return;
      }

      console.log('🔐 通知権限をリクエスト中...');
      
      // 通知権限をリクエストし、FCMトークンを取得
      const { token, error } = await firebaseMessaging.requestPermissionAndGetToken(vapidKey);

      if (error) {
        console.error('❌ FCMトークン取得エラー:', error);
        alert(`❌ 通知の設定に失敗しました\n\n${error}\n\n【よくある原因】\n• 通知権限が拒否されている\n• Service Workerの登録に失敗\n• Firebase設定が間違っている\n\n【対処方法】\n1. ブラウザの設定で通知を許可\n2. ページを再読み込み\n3. もう一度試してください`);
        setNotificationSetupLoading(false);
        return;
      }

      if (!token) {
        console.warn('⚠️ 通知権限が拒否されました');
        alert('❌ 通知権限が拒否されました\n\n【対処方法】\n1. ブラウザのアドレスバーにある鍵アイコンをタップ\n2. 「通知」を「許可」に変更\n3. ページを再読み込み\n4. もう一度「有効化」ボタンをタップ');
        setNotificationSetupLoading(false);
        return;
      }

      console.log('💾 FCMトークンをFirestoreに保存中...');
      
      // トークンをFirestoreに保存
      const saveResult = await firebaseMessaging.saveTokenToFirestore(user.uid, token);

      if (saveResult.error) {
        console.error('❌ トークン保存エラー:', saveResult.error);
        alert(`❌ 通知設定の保存に失敗しました\n\n${saveResult.error}\n\nネットワーク接続を確認して、もう一度試してください。`);
      } else {
        console.log('✅ プッシュ通知セットアップ完了');
        setFcmToken(token);
        setNotificationPermission('granted');
        setShowNotificationPrompt(false);
        alert('✅ プッシュ通知が有効になりました！\n\nタスクの期限前に通知が届きます。\n\n💡 アプリを閉じていても通知を受け取れます。');
      }
    } catch (error: any) {
      console.error('❌ プッシュ通知セットアップエラー:', error);
      let errorMessage = error.message || error.toString();
      alert(`❌ 通知の設定中にエラーが発生しました\n\n${errorMessage}\n\nページを再読み込みして、もう一度試してください。`);
    } finally {
      setNotificationSetupLoading(false);
    }
  }

  const displayTasks = useMemo(() => {
    let filtered = filterTodayOnly 
      ? todays 
      : expandedTasks.filter((t: any) => format(parseISO(t.dateISO), "yyyy-MM-dd") === format(currentDate, "yyyy-MM-dd"));
    
    return filtered;
  }, [filterTodayOnly, todays, expandedTasks, currentDate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-fuchsia-50 to-cyan-50 pb-safe">
      {/* Header - Sticky with safe area */}
      <header className="sticky top-0 z-30 backdrop-blur-lg bg-white/80 border-b border-slate-200 shadow-sm pt-safe">
        <div className="px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-600 text-white grid place-items-center font-bold text-lg sm:text-xl shadow-lg flex-shrink-0">
                VT
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-base sm:text-lg truncate">VoiceTask</div>
                <div className="text-xs text-slate-500 truncate">
                  {user.name || user.email}
                  {user.uid && (
                    <span className="ml-2 text-emerald-600">
                      {tasksLoading ? '🔄 同期中...' : '☁️ クラウド同期'}
                    </span>
                  )}
                  {!user.uid && (
                    <span className="ml-2 text-amber-600">💾 ローカル保存</span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* 同期ステータスインジケーター */}
              {user.uid && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/50 backdrop-blur-sm border border-slate-200">
                  {isSynced ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs text-slate-600 hidden sm:inline">同期済み</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-xs text-slate-600 hidden sm:inline">同期中...</span>
                    </>
                  )}
                  {lastSyncTime && (
                    <span className="text-xs text-slate-400 hidden md:inline">
                      {format(lastSyncTime, 'HH:mm')}
                    </span>
                  )}
                </div>
              )}
              
              {/* Export to Calendar button */}
              <button 
                onClick={() => {
                  console.log('📤 カレンダーエクスポート, タスク数:', tasks.length);
                  if (tasks.length === 0) {
                    alert('エクスポートする予定がありません');
                    return;
                  }
                  downloadICalendar(tasks, `voicetask-${format(new Date(), 'yyyyMMdd')}.ics`);
                  alert(`${tasks.length}件の予定をエクスポートしました！\n\nダウンロードしたファイルを：\n• Google Calendar: 設定 > インポート\n• Apple Calendar: ファイルをダブルクリック\n• Outlook: ファイル > インポート\nから読み込んでください。`);
                }}
                className="min-w-[44px] min-h-[44px] px-3 sm:px-4 rounded-xl border-2 border-violet-300 bg-violet-50 hover:bg-violet-100 active:bg-violet-200 transition text-sm font-medium touch-manipulation"
                title="カレンダーにエクスポート"
              >
                <span className="hidden sm:inline">📅 エクスポート</span>
                <span className="sm:hidden">📅</span>
              </button>
              
              {/* Mobile: Show sidebar toggle */}
              <button 
                onClick={() => setShowSidebar(!showSidebar)}
                className="lg:hidden min-w-[44px] min-h-[44px] rounded-xl border-2 border-slate-300 hover:bg-slate-50 active:bg-slate-100 transition touch-manipulation grid place-items-center"
              >
                <span className="text-xl">{showSidebar ? '✕' : '☰'}</span>
              </button>
              
              <button 
                onClick={onLogout} 
                className="min-w-[44px] min-h-[44px] px-3 sm:px-4 rounded-xl border-2 border-slate-300 hover:bg-slate-50 active:bg-slate-100 transition text-sm font-medium touch-manipulation"
              >
                <span className="hidden sm:inline">ログアウト</span>
                <span className="sm:hidden">🚪</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <div className="relative">
        <main className="px-4 sm:px-6 py-4 sm:py-6 max-w-7xl mx-auto">
          {/* Sync Error Message */}
          {syncError && (
            <div className="mb-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">{syncError}</p>
                  <p className="text-xs text-amber-700 mt-1">
                    データはこのデバイスに保存されます。オンラインに復帰すると自動で同期されます。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Notification Prompt */}
          {showNotificationPrompt && notificationPermission === 'default' && user.uid && (
            <div className="mb-4 p-4 bg-gradient-to-r from-violet-50 to-fuchsia-50 border-2 border-violet-300 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🔔</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-violet-900 mb-2">
                    プッシュ通知を有効にしますか？
                  </p>
                  <p className="text-xs text-violet-700 mb-3">
                    タスクの期限前に通知を受け取れます。アプリを開いていなくても通知が届きます。
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={setupPushNotifications}
                      disabled={notificationSetupLoading}
                      className="px-4 py-2 bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:opacity-90 active:opacity-80 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {notificationSetupLoading ? '設定中...' : '✅ 有効にする'}
                    </button>
                    <button
                      onClick={() => setShowNotificationPrompt(false)}
                      className="px-4 py-2 bg-white border-2 border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 active:bg-slate-100 transition"
                    >
                      後で
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Left column - Main schedule */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-xl sm:text-2xl font-bold">マイスケジュール</h2>
                
                {/* カレンダー表示切替ボタン */}
                <div className="flex items-center gap-2">
                  <div className="text-xs sm:text-sm text-slate-600 font-medium hidden sm:block">
                    {format(currentDate, "M/d(EEE)", { locale: ja })}
                  </div>
                  <div className="flex rounded-lg border-2 border-slate-300 overflow-hidden">
                    <button
                      onClick={() => setViewMode('week')}
                      className={classNames(
                        "px-3 py-1.5 text-xs sm:text-sm font-medium transition touch-manipulation",
                        viewMode === 'week'
                          ? "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 text-white"
                          : "bg-white text-slate-700 hover:bg-slate-50"
                      )}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      週表示
                    </button>
                    <button
                      onClick={() => setViewMode('month')}
                      className={classNames(
                        "px-3 py-1.5 text-xs sm:text-sm font-medium transition touch-manipulation",
                        viewMode === 'month'
                          ? "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 text-white"
                          : "bg-white text-slate-700 hover:bg-slate-50"
                      )}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      月表示
                    </button>
                  </div>
                </div>
              </div>
              
              {/* カレンダー表示: 週表示/月表示を切り替え */}
              {viewMode === 'week' ? (
                <CalendarStrip current={currentDate} onSelectDate={setCurrentDate} tasks={expandedTasks} />
              ) : (
                <MonthCalendar currentDate={currentDate} onSelectDate={setCurrentDate} tasks={expandedTasks} />
              )}

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="font-semibold text-base sm:text-lg">
                  {isToday(currentDate) ? "今日のやること" : format(currentDate, "M/d(EEE) の予定", { locale: ja })}
                </div>
                <label className="text-xs sm:text-sm flex items-center gap-2 cursor-pointer touch-manipulation min-h-[44px]">
                  <input 
                    type="checkbox" 
                    checked={filterTodayOnly} 
                    onChange={()=>setFilterTodayOnly(v=>!v)} 
                    className="w-4 h-4"
                  /> 
                  <span>今日のみ表示</span>
                </label>
              </div>

              <div className="space-y-3">
                {displayTasks
                  .sort((a: any, b: any)=> new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime())
                  .map((t: any) => (
                    <TaskItem 
                      key={t.id} 
                      task={t} 
                      onToggle={toggleDone} 
                      onDelete={remove} 
                      onToggleNotify={toggleNotify} 
                      onUpdate={updateTask}
                    />
                  ))}
                {displayTasks.length === 0 && (
                  <div className="text-center py-12 bg-white/50 rounded-2xl border-2 border-dashed border-slate-300">
                    <div className="text-4xl mb-3">📋</div>
                    <div className="text-slate-600 font-medium">この日に登録されたタスクはありません</div>
                    <div className="text-xs text-slate-500 mt-2">下のボイスメモから予定を追加しましょう</div>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <VoiceCapture onText={addFromText} selectedDate={currentDate} onDateSelect={setCurrentDate} />
              </div>
            </div>

            {/* Right sidebar - Desktop always visible, Mobile toggle */}
            <aside className={classNames(
              "lg:block space-y-4",
              "lg:relative fixed inset-0 z-40 lg:z-auto",
              "lg:bg-transparent bg-black/50 lg:backdrop-blur-none backdrop-blur-sm",
              "lg:p-0 p-4 pt-safe",
              showSidebar ? "block" : "hidden"
            )}
            onClick={() => setShowSidebar(false)}
            >
              <div 
                className="lg:space-y-4 space-y-4 lg:max-w-none max-w-md ml-auto bg-gradient-to-b from-indigo-50 to-fuchsia-50 lg:bg-transparent rounded-2xl lg:rounded-none p-4 lg:p-0 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close button for mobile */}
                <button
                  onClick={() => setShowSidebar(false)}
                  className="lg:hidden w-full min-h-[44px] rounded-xl border-2 border-slate-300 bg-white font-medium hover:bg-slate-50 active:bg-slate-100 transition touch-manipulation mb-4"
                >
                  閉じる
                </button>
                
                <div className="border-2 border-slate-200 rounded-2xl p-4 bg-white shadow-lg">
                  <div className="font-semibold mb-3 text-base sm:text-lg flex items-center gap-2">
                    <span className="text-xl">⏰</span>
                    <span>直近の予定</span>
                  </div>
                  <div className="space-y-2">
                    {upcoming.length === 0 && (
                      <div className="text-sm text-slate-500 text-center py-6">
                        直近の予定はありません
                      </div>
                    )}
                    {upcoming.map((t: any) => (
                      <div key={t.id} className="text-sm p-3 rounded-xl border-2 border-slate-200 hover:border-violet-300 transition">
                        <div className="font-medium mb-1 break-words">{t.title}</div>
                        <div className="text-xs text-slate-600 flex flex-wrap gap-x-2">
                          <span>📅 {format(new Date(t.dateISO), "M/d(EEE) H:mm", { locale: ja })}</span>
                          <span>⏱️ {t.durationMin}分</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 通知設定 */}
                <div className="border-2 border-slate-200 rounded-2xl p-4 bg-white shadow-lg">
                  <div className="font-semibold mb-3 text-base sm:text-lg flex items-center gap-2">
                    <span className="text-xl">🔔</span>
                    <span>通知設定</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex-1">
                        <div className="text-sm font-medium">プッシュ通知</div>
                        <div className="text-xs text-slate-600 mt-1">
                          {notificationPermission === 'granted' ? (
                            <span className="text-emerald-600">✅ 有効</span>
                          ) : notificationPermission === 'denied' ? (
                            <span className="text-red-600">❌ 拒否されています</span>
                          ) : (
                            <span className="text-amber-600">⚠️ 未設定</span>
                          )}
                        </div>
                      </div>
                      {notificationPermission !== 'granted' && user.uid && (
                        <button
                          onClick={setupPushNotifications}
                          disabled={notificationSetupLoading}
                          className="ml-3 px-4 py-2 bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:opacity-90 active:opacity-80 transition disabled:opacity-50"
                        >
                          {notificationSetupLoading ? '設定中...' : '有効化'}
                        </button>
                      )}
                    </div>

                    {notificationPermission === 'denied' && (
                      <div className="text-xs text-slate-600 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        ブラウザの設定から通知を許可してください
                      </div>
                    )}

                    {!user.uid && (
                      <div className="text-xs text-slate-600 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        プッシュ通知を使うには、ログインが必要です
                      </div>
                    )}
                  </div>
                </div>

                {/* Google Calendar連携 */}
                <div className="border-2 border-slate-200 rounded-2xl p-4 bg-white shadow-lg">
                  <div className="font-semibold mb-3 text-base sm:text-lg flex items-center gap-2">
                    <span className="text-xl">📆</span>
                    <span>Google Calendar連携</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex-1">
                        <div className="text-sm font-medium">自動同期</div>
                        <div className="text-xs text-slate-600 mt-1">
                          {googleCalendarEnabled ? (
                            <span className="text-emerald-600">✅ 有効</span>
                          ) : (
                            <span className="text-slate-500">⚪ 無効</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (googleCalendarEnabled) {
                            // 無効化
                            try {
                              const { googleCalendar } = await import('./lib/googleCalendar');
                              googleCalendar.revokeAccessToken();
                              setGoogleCalendarEnabled(false);
                              alert('✅ Google Calendar連携を無効化しました');
                            } catch (error: any) {
                              console.error('Google Calendar無効化エラー:', error);
                              setGoogleCalendarEnabled(false);
                            }
                          } else {
                            // 有効化
                            setGoogleCalendarLoading(true);
                            try {
                              console.log('🔄 Google Calendar連携を開始します...');
                              const { googleCalendar } = await import('./lib/googleCalendar');
                              
                              // 初期化
                              console.log('📦 Google API を初期化中...');
                              const initResult = await googleCalendar.init();
                              if (!initResult.success) {
                                console.error('❌ 初期化失敗:', initResult.error);
                                alert(`❌ Google Calendar APIの初期化に失敗しました\n\n${initResult.error}\n\n【対処方法】\n1. ページを再読み込みしてください\n2. ブラウザのポップアップブロックを解除してください\n3. それでも失敗する場合は、開発者にお問い合わせください`);
                                return;
                              }
                              
                              // アクセストークンをリクエスト
                              console.log('🔐 Googleアカウントの認証を開始...');
                              console.log('💡 ポップアップが表示されます。ブロックされている場合は許可してください');
                              
                              await googleCalendar.requestAccessToken();
                              
                              setGoogleCalendarEnabled(true);
                              console.log('✅ Google Calendar連携が有効になりました');
                              alert('✅ Google Calendarとの連携が有効になりました！\n\nこれから作成するタスクは自動的にGoogleカレンダーに追加されます。');
                            } catch (error: any) {
                              console.error('❌ Google Calendar連携エラー:', error);
                              console.error('❌ エラーの詳細:', JSON.stringify(error, null, 2));
                              
                              let errorMessage = '不明なエラーが発生しました';
                              
                              if (error.message) {
                                errorMessage = error.message;
                              } else if (typeof error === 'string') {
                                errorMessage = error;
                              } else if (error.error) {
                                errorMessage = error.error;
                              }
                              
                              // タイムアウトエラーの場合
                              if (errorMessage.includes('タイムアウト')) {
                                alert(`❌ 認証がタイムアウトしました\n\n【原因】\nポップアップがブロックされているか、認証ウィンドウが開かなかった可能性があります。\n\n【対処方法】\n1. ブラウザのアドレスバー右側のポップアップブロックアイコンを確認\n2. ポップアップを許可に設定\n3. もう一度「自動同期」ボタンをタップ\n\nスマホの場合:\n• Chromeの場合: 設定 > サイトの設定 > ポップアップとリダイレクト\n• Safariの場合: 設定 > Safari > ポップアップブロック`);
                              } else {
                                alert(`❌ Google Calendarの連携に失敗しました\n\n${errorMessage}\n\n【よくある原因】\n• ポップアップがブロックされている\n• Googleアカウントでログインしていない\n• 権限の許可をキャンセルした\n\n【対処方法】\n1. ブラウザのアドレスバー右側のポップアップブロックアイコンを確認\n2. ポップアップを許可して、もう一度試してください`);
                              }
                            } finally {
                              setGoogleCalendarLoading(false);
                            }
                          }
                        }}
                        disabled={googleCalendarLoading}
                        className="ml-3 px-4 py-2 bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:opacity-90 active:opacity-80 transition disabled:opacity-50"
                      >
                        {googleCalendarLoading ? '処理中...' : googleCalendarEnabled ? '無効化' : '有効化'}
                      </button>
                    </div>

                    <div className="text-xs text-slate-600 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      💡 有効にすると、VoiceTaskで作成したタスクが自動的にGoogleカレンダーに追加されます
                    </div>
                  </div>
                </div>

                <div className="border-2 border-slate-200 rounded-2xl p-4 bg-white shadow-lg">
                  <div className="font-semibold mb-2 text-base sm:text-lg flex items-center gap-2">
                    <span className="text-xl">💡</span>
                    <span>ヒント</span>
                  </div>
                  <ul className="space-y-2 text-xs sm:text-sm text-slate-600">
                    <li className="flex gap-2">
                      <span className="flex-shrink-0">•</span>
                      <span>「明日10時 重要 顧客に電話 30分」のように話すと自動解析します</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0">•</span>
                      <span>「#プロジェクトA」のように#をつけるとタグが追加されます</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0">•</span>
                      <span>「毎日」「毎週月曜」など繰り返しパターンを自動認識します</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0">•</span>
                      <span>「重要/至急/最優先」を含むと通知ONになります</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0">•</span>
                      <span>通知は開始{defaultLeadMin}分前に届きます</span>
                    </li>
                  </ul>
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>

      <footer className="text-center text-xs text-slate-500 py-6 mt-8 pb-safe">
        © {new Date().getFullYear()} VoiceTask - All devices supported
      </footer>
      
      {/* Add custom styles for scrollbar hiding and safe areas */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @supports (padding: env(safe-area-inset-top)) {
          .pt-safe {
            padding-top: env(safe-area-inset-top);
          }
          .pb-safe {
            padding-bottom: env(safe-area-inset-bottom);
          }
        }
      `}</style>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Firebase認証状態の監視
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const setupAuthListener = async () => {
      try {
        const { firebaseAuth } = await import('./lib/firebase');
        
        unsubscribe = firebaseAuth.onAuthStateChanged((firebaseUser) => {
          console.log('🔐 Firebase認証状態変更:', firebaseUser ? `ログイン中 (${firebaseUser.email})` : 'ログアウト');
          
          if (firebaseUser) {
            // Firebase認証済みユーザー
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'ユーザー'
            });
          } else {
            // ログアウト状態
            setUser(null);
          }
          setAuthLoading(false);
        });
      } catch (error) {
        console.warn('⚠️ Firebase初期化失敗、デモモードで継続:', error);
        setAuthLoading(false);
      }
    };

    setupAuthListener();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ログアウト処理
  const handleLogout = async () => {
    try {
      const { firebaseAuth } = await import('./lib/firebase');
      await firebaseAuth.signOut();
      console.log('✅ ログアウト完了');
    } catch (error) {
      console.error('❌ ログアウトエラー:', error);
      // デモモードの場合はローカルで処理
      setUser(null);
    }
  };

  // ローディング中
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-fuchsia-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">読み込み中...</p>
        </div>
      </div>
    );
  }

  return user ? <Dashboard user={user} onLogout={handleLogout} /> : <Login onLogin={setUser} />;
}
