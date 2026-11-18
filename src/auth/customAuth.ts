import {
  DEFAULT_UNLOCKED_CLASSES,
  DEFAULT_UNLOCKED_KILLERS,
  KILLER_PRICES,
  SURVIVOR_PRICES,
} from '../game/constants';
import type { KillerId, SurvivorClassId } from '../game/types';
import { hasNodeBackend } from '../multiplayer/client';

export interface AuthUser {
  username: string;
  coins: number;
  unlockedClasses: SurvivorClassId[];
  unlockedKillers: KillerId[];
}

const TOKEN_KEY = 'zone51_auth_token_v1';
const LOCAL_USERS_KEY = 'zone51_local_users_v1';
const LOCAL_SESSION_USER_KEY = 'zone51_local_session_user_v1';

interface LocalUserRecord {
  username: string;
  usernameLower: string;
  salt: string;
  hash: string;
  coins?: number;
  unlockedClasses?: SurvivorClassId[];
  unlockedKillers?: KillerId[];
  claimedMatchIds?: string[];
}

function normalizeAuthUser(raw: any): AuthUser {
  const clsSet = new Set<SurvivorClassId>(DEFAULT_UNLOCKED_CLASSES);
  if (Array.isArray(raw?.unlockedClasses)) {
    for (const c of raw.unlockedClasses) {
      if (c in SURVIVOR_PRICES) {
        if (c === 'builder' && raw?.builderPurchased !== true) {
          continue;
        }
        clsSet.add(c as SurvivorClassId);
      }
    }
  }
  for (const [cls, price] of Object.entries(SURVIVOR_PRICES)) {
    if (price === 0) clsSet.add(cls as SurvivorClassId);
  }
  const kilSet = new Set<KillerId>(DEFAULT_UNLOCKED_KILLERS);
  if (Array.isArray(raw?.unlockedKillers)) {
    for (const k of raw.unlockedKillers) {
      if (k in KILLER_PRICES) kilSet.add(k as KillerId);
    }
  }
  return {
    username: String(raw?.username ?? 'Oyuncu'),
    coins: Math.max(0, Math.floor(Number(raw?.coins) || 0)),
    unlockedClasses: Array.from(clsSet),
    unlockedKillers: Array.from(kilSet),
  };
}

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (!token) {
      window.localStorage.removeItem(TOKEN_KEY);
    } else {
      window.localStorage.setItem(TOKEN_KEY, token);
    }
  } catch {
    // ignore storage errors
  }
}

async function hashLocalPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (window.crypto?.subtle) {
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function loadLocalUsers(): LocalUserRecord[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalUsers(users: LocalUserRecord[]) {
  try {
    window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
}

async function detectBackend(): Promise<boolean> {
  if (hasNodeBackend()) return true;
  try {
    const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok) {
        (window as any).__KK_BACKEND__ = true;
        return true;
      }
    }
  } catch {
    // static mode
  }
  return false;
}

export async function registerAccount(usernameRaw: string, password: string): Promise<AuthUser> {
  const username = usernameRaw.trim();
  if (username.length < 3 || username.length > 16) {
    throw new Error('Kullanıcı adı 3 ile 16 karakter arasında olmalıdır.');
  }
  if (password.length < 4) {
    throw new Error('Şifre en az 4 karakter olmalıdır.');
  }

  if (await detectBackend()) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error || 'Kayıt olunamadı.');
    }
    writeToken(body.token);
    return normalizeAuthUser(body.user);
  }

  const users = loadLocalUsers();
  const lower = username.toLowerCase();
  if (users.some((u) => u.usernameLower === lower)) {
    throw new Error('Bu kullanıcı adı zaten kayıtlı.');
  }
  const salt = Math.random().toString(36).slice(2, 12);
  const hash = await hashLocalPassword(password, salt);
  const record: LocalUserRecord = {
    username,
    usernameLower: lower,
    salt,
    hash,
    coins: 0,
    unlockedClasses: [...DEFAULT_UNLOCKED_CLASSES],
    unlockedKillers: [...DEFAULT_UNLOCKED_KILLERS],
    claimedMatchIds: [],
  };
  users.push(record);
  saveLocalUsers(users);
  window.localStorage.setItem(LOCAL_SESSION_USER_KEY, username);
  return normalizeAuthUser(record);
}

export async function loginAccount(usernameRaw: string, password: string): Promise<AuthUser> {
  const username = usernameRaw.trim();
  if (!username || !password) {
    throw new Error('Kullanıcı adı ve şifre gereklidir.');
  }

  if (await detectBackend()) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error || 'Kullanıcı adı veya şifre hatalı.');
    }
    writeToken(body.token);
    return normalizeAuthUser(body.user);
  }

  const users = loadLocalUsers();
  const lower = username.toLowerCase();
  const found = users.find((u) => u.usernameLower === lower);
  if (!found) {
    throw new Error('Kullanıcı adı veya şifre hatalı.');
  }
  const hash = await hashLocalPassword(password, found.salt);
  if (hash !== found.hash) {
    throw new Error('Kullanıcı adı veya şifre hatalı.');
  }
  window.localStorage.setItem(LOCAL_SESSION_USER_KEY, found.username);
  return normalizeAuthUser(found);
}

export async function restoreAuthSession(): Promise<AuthUser | null> {
  if (await detectBackend()) {
    const token = readToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        writeToken(null);
        return null;
      }
      const body = await res.json();
      return body?.user ? normalizeAuthUser(body.user) : null;
    } catch {
      return null;
    }
  }

  try {
    const saved = window.localStorage.getItem(LOCAL_SESSION_USER_KEY);
    if (!saved) return null;
    const users = loadLocalUsers();
    const found = users.find((u) => u.usernameLower === saved.toLowerCase());
    return found ? normalizeAuthUser(found) : normalizeAuthUser({ username: saved });
  } catch {
    return null;
  }
}

export async function refreshAuthUser(): Promise<AuthUser | null> {
  return restoreAuthSession();
}

export async function buyUnlock(
  kind: 'survivor' | 'killer',
  id: SurvivorClassId | KillerId
): Promise<AuthUser> {
  if (await detectBackend()) {
    const token = readToken();
    if (!token) throw new Error('Oturum bulunamadı.');
    const res = await fetch('/api/economy/buy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kind, id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error || 'Satın alma başarısız.');
    }
    return normalizeAuthUser(body.user);
  }

  const saved = window.localStorage.getItem(LOCAL_SESSION_USER_KEY);
  if (!saved) throw new Error('Oturum bulunamadı.');
  const users = loadLocalUsers();
  const idx = users.findIndex((u) => u.usernameLower === saved.toLowerCase());
  if (idx === -1) throw new Error('Kullanıcı bulunamadı.');
  const user = users[idx];
  const norm = normalizeAuthUser(user);

  if (kind === 'survivor') {
    const clsId = id as SurvivorClassId;
    if (norm.unlockedClasses.includes(clsId)) return norm;
    const price = SURVIVOR_PRICES[clsId] ?? 0;
    if (norm.coins < price) throw new Error(`Yetersiz para! (${price} para gerekli)`);
    norm.coins -= price;
    norm.unlockedClasses.push(clsId);
  } else {
    const kilId = id as KillerId;
    if (norm.unlockedKillers.includes(kilId)) return norm;
    const price = KILLER_PRICES[kilId] ?? 0;
    if (norm.coins < price) throw new Error(`Yetersiz para! (${price} para gerekli)`);
    norm.coins -= price;
    norm.unlockedKillers.push(kilId);
  }

  users[idx] = {
    ...user,
    coins: norm.coins,
    unlockedClasses: norm.unlockedClasses,
    unlockedKillers: norm.unlockedKillers,
    ...(kind === 'survivor' && id === 'builder' ? { builderPurchased: true } : {}),
  };
  saveLocalUsers(users);
  return norm;
}

export async function claimMatchCoins(matchId: string, amount: number): Promise<AuthUser | null> {
  const safeAmount = Math.max(0, Math.floor(amount));
  if (!matchId) return null;

  if (await detectBackend()) {
    const token = readToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/economy/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ matchId, amount: safeAmount }),
      });
      if (!res.ok) return null;
      const body = await res.json();
      return body?.user ? normalizeAuthUser(body.user) : null;
    } catch {
      return null;
    }
  }

  const saved = window.localStorage.getItem(LOCAL_SESSION_USER_KEY);
  if (!saved) return null;
  const users = loadLocalUsers();
  const idx = users.findIndex((u) => u.usernameLower === saved.toLowerCase());
  if (idx === -1) return null;
  const user = users[idx];
  const claimed = Array.isArray(user.claimedMatchIds) ? user.claimedMatchIds : [];
  if (claimed.includes(matchId)) {
    return normalizeAuthUser(user);
  }
  const nextCoins = Math.max(0, Math.floor(Number(user.coins) || 0)) + safeAmount;
  users[idx] = {
    ...user,
    coins: nextCoins,
    claimedMatchIds: [...claimed.slice(-49), matchId],
  };
  saveLocalUsers(users);
  return normalizeAuthUser(users[idx]);
}

export async function logoutAccount(): Promise<void> {
  const token = readToken();
  writeToken(null);
  try {
    window.localStorage.removeItem(LOCAL_SESSION_USER_KEY);
  } catch {
    // ignore
  }
  if (token && (await detectBackend())) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
}
