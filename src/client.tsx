import React, { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO, startOfToday, isToday, addMinutes, isAfter, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, isSameMonth, isSameDay, eachDayOfInterval } from "date-fns";
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
 * @typedef Task
 * @property {string} id
 * @property {string} title
 * @property {string} note
 * @property {string} dateISO // Start datetime
 * @property {number} durationMin
 * @property {Priority} priority
 * @property {boolean} done
 * @property {boolean} notify
 */

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

  // title cleanup - 日付関連のキーワードは削除しない（日付は選択済み）
  let title = text
    .replace(/(\d{1,2}:\d{2}|午前|午後|AM|PM|\d+分|\d+時間|重要|至急|最優先)/g, "")
    .replace(/[\s　]+/g, " ")
    .trim();
  if (!title) title = "ボイスメモ";

  return {
    id: uuidv4(),
    title,
    note: text,
    dateISO: refDate.toISOString(),
    durationMin,
    priority,
    done: false,
    notify: priority === "high", // high -> notify by default
  };
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
        
        return (
          <button 
            key={d.toISOString()} 
            onClick={()=>onSelectDate(d)} 
            className={classNames(
              "min-w-[80px] sm:min-w-[88px] p-3 sm:p-4 rounded-2xl border text-left snap-center flex-shrink-0 touch-manipulation transition-all",
              selected 
                ? "bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 text-white border-transparent shadow-lg scale-105" 
                : "bg-white border-slate-200 hover:border-violet-300 hover:shadow-md active:scale-95"
            )}
          >
            <div className={classNames("text-xs mb-1", selected ? "opacity-90" : "opacity-60")}>
              {format(d, "M/d", { locale: ja })}
            </div>
            <div className={classNames("text-xs font-medium mb-0.5", selected ? "opacity-90" : "opacity-60")}>
              {format(d, "EEE", { locale: ja })}
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
                    : taskCount > 0
                      ? "bg-fuchsia-50 border-2 border-fuchsia-200 hover:bg-fuchsia-100"
                      : "bg-white border border-slate-200 hover:bg-slate-50",
                !isCurrentMonth && "opacity-30",
                "flex flex-col items-center justify-center"
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className={classNames(
                "text-sm font-medium",
                !isCurrentMonth && "text-slate-400",
                isSelected && "text-white",
                !isSelected && dayOfWeek === 0 && "text-red-600",
                !isSelected && dayOfWeek === 6 && "text-blue-600"
              )}>
                {format(day, "d")}
              </div>
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

function VoiceCapture({ onText, selectedDate }: { onText: (text: string, targetDate: Date) => void; selectedDate: Date }) {
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
          
          {/* 選択中の日付表示 */}
          {lastText.trim().length > 0 && (
            <div className="bg-gradient-to-r from-fuchsia-50 via-violet-50 to-indigo-50 border-2 border-violet-300 rounded-xl p-4">
              <div className="text-sm font-medium text-slate-700 mb-2">
                📅 登録先の日付
              </div>
              <div className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600">
                {format(selectedDate, "M月d日(EEE)", { locale: ja })}
                {isToday(selectedDate) && <span className="ml-2 text-sm">(今日)</span>}
              </div>
              <div className="text-xs text-slate-600 mt-2">
                💡 他の日付に登録したい場合は、上のカレンダーから日付を選択してください
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

function TaskItem({ task, onToggle, onDelete, onToggleNotify }: any) {
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
            
            <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>📅 {format(when, "M/d(EEE) H:mm", { locale: ja })}</span>
              <span>⏱️ {task.durationMin}分</span>
              {task.notify && <span>🔔 通知ON</span>}
            </div>
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
        <div className="px-4 pb-4 space-y-2 border-t border-slate-200 pt-3">
          <div className="flex gap-2">
            <label className="flex-1 flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg border-2 border-slate-300 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition touch-manipulation">
              <input 
                type="checkbox" 
                checked={task.notify} 
                onChange={()=>onToggleNotify(task.id)} 
                className="w-5 h-5"
              />
              <span className="text-sm font-medium">通知</span>
            </label>
            <button 
              onClick={()=>onDelete(task.id)} 
              className="flex-shrink-0 min-h-[44px] px-4 py-2 rounded-lg border-2 border-red-300 text-red-600 font-medium hover:bg-red-50 active:bg-red-100 transition touch-manipulation"
            >
              削除
            </button>
          </div>
          <button 
            onClick={() => {
              downloadICalendar([task], `${task.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`);
              alert('この予定をカレンダー形式でエクスポートしました！');
            }}
            className="w-full min-h-[44px] px-4 py-2 rounded-lg border-2 border-violet-300 bg-violet-50 text-violet-700 font-medium hover:bg-violet-100 active:bg-violet-200 transition touch-manipulation text-sm"
          >
            📅 この予定をカレンダーにエクスポート
          </button>
        </div>
      )}
    </div>
  );
}

function Dashboard({ user, onLogout }: any) {
  const [currentDate, setCurrentDate] = useState(startOfToday());
  const [tasks, setTasks] = useState(() => loadTasks(user.email));
  const [filterTodayOnly, setFilterTodayOnly] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week'); // カレンダー表示モード

  useEffect(() => { saveTasks(user.email, tasks); }, [tasks, user.email]);

  useEffect(() => {
    ensureNotificationPermission();
    // schedule future notifs for existing tasks
    tasks.forEach((t: any)=>{
      clearNotification(t.id);
      if (isAfter(new Date(t.dateISO), new Date())) scheduleNotification(t);
    });
    return () => tasks.forEach((t: any)=>clearNotification(t.id));
  }, []);

  const todays = useMemo(() => {
    const filtered = tasks.filter((t: any) => {
      const taskDate = format(parseISO(t.dateISO), "yyyy-MM-dd");
      const currDate = format(currentDate, "yyyy-MM-dd");
      return taskDate === currDate;
    });
    console.log('📅 今日の予定フィルター:', {
      currentDate: format(currentDate, "yyyy-MM-dd", { locale: ja }),
      allTasks: tasks.length,
      todayTasks: filtered.length,
      tasks: filtered.map((t: any) => ({
        title: t.title,
        date: format(parseISO(t.dateISO), "yyyy-MM-dd HH:mm", { locale: ja })
      }))
    });
    return filtered;
  }, [tasks, currentDate]);
  
  const upcoming = useMemo(() => tasks
    .filter((t: any) => !t.done && isAfter(new Date(t.dateISO), new Date()))
    .sort((a: any, b: any)=> new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime())
    .slice(0, 5)
  , [tasks]);

  function addFromText(text: string, targetDate: Date) {
    const task = parseVoiceTextToTask(text, targetDate);
    console.log('📝 新しいタスク作成:', {
      text,
      targetDate: format(targetDate, "yyyy-MM-dd", { locale: ja }),
      task,
      dateISO: task.dateISO,
      date: new Date(task.dateISO),
      formatted: format(new Date(task.dateISO), "yyyy-MM-dd HH:mm", { locale: ja })
    });
    setTasks((prev: any) => {
      const next = [task, ...prev];
      console.log('📋 タスクリスト更新:', next.length, '件');
      // schedule notif for new task
      if (task.notify) scheduleNotification(task);
      return next;
    });
  }

  function toggleDone(id: string) {
    setTasks((prev: any) => prev.map((t: any) => t.id === id ? { ...t, done: !t.done } : t));
  }
  
  function toggleNotify(id: string) {
    setTasks((prev: any) => prev.map((t: any) => {
      if (t.id !== id) return t;
      const next = { ...t, notify: !t.notify };
      clearNotification(t.id);
      if (next.notify) scheduleNotification(next);
      return next;
    }));
  }
  
  function remove(id: string) {
    clearNotification(id);
    setTasks((prev: any) => prev.filter((t: any) => t.id !== id));
  }

  const displayTasks = filterTodayOnly 
    ? todays 
    : tasks.filter((t: any) => format(parseISO(t.dateISO), "yyyy-MM-dd") === format(currentDate, "yyyy-MM-dd"));

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
                <div className="text-xs text-slate-500 truncate">{user.name || user.email}</div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
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
                <CalendarStrip current={currentDate} onSelectDate={setCurrentDate} tasks={tasks} />
              ) : (
                <MonthCalendar currentDate={currentDate} onSelectDate={setCurrentDate} tasks={tasks} />
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
                <VoiceCapture onText={addFromText} selectedDate={currentDate} />
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
                      <span>「重要/至急/最優先」を含むと通知ONになります</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0">•</span>
                      <span>通知は開始{defaultLeadMin}分前に届きます</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0">•</span>
                      <span>カレンダーを左右にスワイプして日付を切り替えられます</span>
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
  return user ? <Dashboard user={user} onLogout={()=>setUser(null)} /> : <Login onLogin={setUser} />;
}
