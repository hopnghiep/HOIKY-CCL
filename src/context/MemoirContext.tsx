import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { INITIAL_MEMOIR_DATA, SCHEMA_VERSION } from '../data/initialData';
import type { ActiveTab, AppSettings, MemberProfile, MemoirDatabase } from '../types/memoir';
import {
  listPreRestoreBackups,
  loadMemoirFromIndexedDB,
  saveMemoirToIndexedDB,
  savePreRestoreBackup,
  type LocalBackupSnapshot,
} from '../services/indexedDb';
import { clearStoredAdminToken, getAdminAuthHeaders, setStoredAdminToken } from '../services/authToken';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface MemoirContextValue {
  data: MemoirDatabase;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isLoading: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  isAdmin: boolean;
  adminName: string | null;
  authConfigured: boolean;
  aiConfigured: boolean;
  canUndo: boolean;
  canRedo: boolean;
  pendingMemberIds: string[];
  toasts: ToastMessage[];
  backups: LocalBackupSnapshot[];
  notify: (text: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;
  updateData: (updater: (prev: MemoirDatabase) => MemoirDatabase, label?: string) => void;
  updateSelfMemberProfile: (updatedMember: MemberProfile, label?: string) => void;
  publishMemberUpdate: (memberId?: string) => Promise<boolean>;
  undo: () => void;
  redo: () => void;
  syncNow: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  loginAdmin: (password: string) => Promise<{ ok: boolean; error?: string }>;
  setupAdmin: (adminName: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logoutAdmin: () => Promise<void>;
  restoreFromPackage: (nextDb: MemoirDatabase, reason?: string) => Promise<void>;
  restoreFromSnapshot: (snapshotId: string) => Promise<void>;
  clearSampleData: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

const MemoirContext = createContext<MemoirContextValue | null>(null);

const MAX_HISTORY = 35;

export function MemoirProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<MemoirDatabase>(INITIAL_MEMOIR_DATA);
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);

  const [historyPast, setHistoryPast] = useState<MemoirDatabase[]>([]);
  const [historyFuture, setHistoryFuture] = useState<MemoirDatabase[]>([]);
  const [pendingMemberIds, setPendingMemberIds] = useState<string[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [backups, setBackups] = useState<LocalBackupSnapshot[]>([]);

  const dataRef = useRef(data);
  dataRef.current = data;

  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;

  const pendingMemberIdsRef = useRef(pendingMemberIds);
  pendingMemberIdsRef.current = pendingMemberIds;

  const notify = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshBackups = useCallback(async () => {
    const list = await listPreRestoreBackups();
    setBackups(list);
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const [authRes, healthRes] = await Promise.all([
        fetch('/api/auth/status', { headers: getAdminAuthHeaders() }),
        fetch('/api/health'),
      ]);
      if (authRes.ok) {
        const authJson = (await authRes.json()) as {
          isConfigured: boolean;
          authenticated: boolean;
          adminName: string | null;
        };
        setAuthConfigured(authJson.isConfigured);
        setIsAdmin(authJson.authenticated);
        setAdminName(authJson.adminName);
      }
      if (healthRes.ok) {
        const healthJson = (await healthRes.json()) as { aiConfigured: boolean };
        setAiConfigured(Boolean(healthJson.aiConfigured));
      }
    } catch {
      // Offline mode still works with IndexedDB
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setIsLoading(true);
      await refreshAuth();

      // Priority: Server persisted memoir -> IndexedDB -> Initial sample data
      let loaded: MemoirDatabase | null = null;
      try {
        const res = await fetch('/api/memoir');
        if (res.ok) {
          loaded = (await res.json()) as MemoirDatabase;
        }
      } catch {
        // Ignore network error, try IndexedDB
      }

      if (!loaded) {
        loaded = await loadMemoirFromIndexedDB();
      }

      if (active) {
        if (loaded && loaded.home && Array.isArray(loaded.members) && Array.isArray(loaded.events)) {
          const normalizedLoaded: MemoirDatabase = {
            ...loaded,
            cohorts: Array.isArray(loaded.cohorts) ? loaded.cohorts : [],
          };
          setData(normalizedLoaded);
          await saveMemoirToIndexedDB(normalizedLoaded).catch(() => {});
        } else {
          setData(INITIAL_MEMOIR_DATA);
          await saveMemoirToIndexedDB(INITIAL_MEMOIR_DATA).catch(() => {});
        }
        await refreshBackups();
        setIsLoading(false);
      }
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, [refreshAuth, refreshBackups]);

  // Apply theme class to document root
  useEffect(() => {
    const html = document.documentElement;
    if (data.settings.themeMode === 'neutral') {
      html.classList.remove('dark');
    } else {
      html.classList.add('dark');
    }
  }, [data.settings.themeMode]);

  const persistDatabase = useCallback(async (nextDb: MemoirDatabase, pushToServer: boolean) => {
    setIsSaving(true);
    try {
      await saveMemoirToIndexedDB(nextDb);
      if (pushToServer && isAdminRef.current) {
        const res = await fetch('/api/memoir', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
          body: JSON.stringify(nextDb),
        });
        if (res.status === 401) {
          clearStoredAdminToken();
          setIsAdmin(false);
          setAdminName(null);
          throw new Error('Phiên quản trị đã hết hạn hoặc không hợp lệ. Vui lòng nhấn "Đăng nhập" để xác thực lại.');
        }
        if (!res.ok) {
          const errJson = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errJson.error || 'Không thể đồng bộ lên máy chủ.');
        }
      }
      setLastSavedAt(new Date().toISOString());
    } finally {
      setIsSaving(false);
    }
  }, []);

  const updateData = useCallback(
    (updater: (prev: MemoirDatabase) => MemoirDatabase, label?: string) => {
      const current = dataRef.current;
      const updatedRaw = updater(current);
      const nextDb: MemoirDatabase = {
        ...updatedRaw,
        schemaVersion: SCHEMA_VERSION,
        lastModified: new Date().toISOString(),
      };

      setHistoryPast((past) => [...past.slice(-(MAX_HISTORY - 1)), current]);
      setHistoryFuture([]);
      setData(nextDb);

      if (nextDb.settings.autoSaveEnabled) {
        persistDatabase(nextDb, true)
          .then(() => {
            if (label) {
              notify(label, 'success');
            }
          })
          .catch((err) => {
            notify(err instanceof Error ? err.message : 'Lỗi khi tự động lưu dữ liệu.', 'error');
          });
      }
    },
    [notify, persistDatabase]
  );

  const updateSelfMemberProfile = useCallback(
    (updatedMember: MemberProfile, label?: string) => {
      const current = dataRef.current;
      const nextDb: MemoirDatabase = {
        ...current,
        schemaVersion: SCHEMA_VERSION,
        lastModified: new Date().toISOString(),
        members: current.members.map((m) =>
          m.id === updatedMember.id
            ? {
                ...updatedMember,
                id: m.id,
                group: m.group,
                orderIndex: m.orderIndex,
                dataOrigin: 'real',
                updatedAt: new Date().toISOString(),
              }
            : m
        ),
      };

      setHistoryPast((past) => [...past.slice(-(MAX_HISTORY - 1)), current]);
      setHistoryFuture([]);
      setData(nextDb);

      if (isAdminRef.current) {
        persistDatabase(nextDb, true)
          .then(() => {
            if (label) notify(label, 'success');
          })
          .catch((err) => {
            notify(err instanceof Error ? err.message : 'Lỗi khi lưu hồ sơ.', 'error');
          });
      } else {
        setPendingMemberIds((ids) => (ids.includes(updatedMember.id) ? ids : [...ids, updatedMember.id]));
        saveMemoirToIndexedDB(nextDb)
          .then(() => {
            setLastSavedAt(new Date().toISOString());
            notify(
              label || 'Đã lưu thay đổi cục bộ. Nhấn nút "Cập nhật" để cập nhật lên ứng dụng.',
              'info'
            );
          })
          .catch(() => {});
      }
    },
    [notify, persistDatabase]
  );

  const publishMemberUpdate = useCallback(
    async (memberId?: string): Promise<boolean> => {
      const targetIds = memberId ? [memberId] : pendingMemberIdsRef.current;
      if (targetIds.length === 0) {
        return true;
      }

      setIsSaving(true);
      try {
        const current = dataRef.current;
        for (const id of targetIds) {
          const target = current.members.find((m) => m.id === id);
          if (!target) continue;
          const res = await fetch(`/api/members/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member: target, seedDatabase: current }),
          });
          if (!res.ok) {
            const errJson = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(errJson.error || 'Không thể cập nhật hồ sơ lên máy chủ.');
          }
        }
        await saveMemoirToIndexedDB(current);
        setPendingMemberIds((prev) => prev.filter((id) => !targetIds.includes(id)));
        setLastSavedAt(new Date().toISOString());
        notify('Đã cập nhật hồ sơ thành viên lên ứng dụng thành công.', 'success');
        return true;
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Không thể cập nhật hồ sơ lên ứng dụng.', 'error');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [notify]
  );

  const undo = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) return past;
      const previous = past[past.length - 1];
      const rest = past.slice(0, -1);
      setHistoryFuture((future) => [dataRef.current, ...future]);
      setData(previous);
      persistDatabase(previous, true).catch(() => {});
      notify('Đã hoàn tác thao tác gần nhất.', 'info');
      return rest;
    });
  }, [notify, persistDatabase]);

  const redo = useCallback(() => {
    setHistoryFuture((future) => {
      if (future.length === 0) return future;
      const next = future[0];
      const rest = future.slice(1);
      setHistoryPast((past) => [...past, dataRef.current]);
      setData(next);
      persistDatabase(next, true).catch(() => {});
      notify('Đã làm lại thao tác vừa hoàn tác.', 'info');
      return rest;
    });
  }, [notify, persistDatabase]);

  const syncNow = useCallback(async () => {
    try {
      setIsSaving(true);
      if (isAdminRef.current) {
        await persistDatabase(dataRef.current, true);
        setPendingMemberIds([]);
        notify('Đã lưu và đồng bộ toàn bộ dữ liệu Hồi ký.', 'success');
      } else if (pendingMemberIdsRef.current.length > 0) {
        await publishMemberUpdate();
      } else {
        const res = await fetch('/api/memoir');
        if (res.ok) {
          const remoteRaw = (await res.json()) as MemoirDatabase;
          const remote: MemoirDatabase = {
            ...remoteRaw,
            cohorts: Array.isArray(remoteRaw.cohorts) ? remoteRaw.cohorts : [],
          };
          setData(remote);
          await saveMemoirToIndexedDB(remote);
          notify('Đã cập nhật dữ liệu mới nhất từ máy chủ lưu trữ.', 'success');
        } else {
          await saveMemoirToIndexedDB(dataRef.current);
          notify('Đã làm mới bộ nhớ lưu trữ cục bộ.', 'info');
        }
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Không thể đồng bộ dữ liệu.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [notify, persistDatabase, publishMemberUpdate]);

  const loginAdmin = useCallback(
    async (password: string) => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const json = (await res.json()) as { ok?: boolean; adminName?: string; token?: string; error?: string };
        if (!res.ok) {
          return { ok: false, error: json.error || 'Đăng nhập thất bại.' };
        }
        setStoredAdminToken(json.token);
        setIsAdmin(true);
        setAdminName(json.adminName || 'Quản trị viên');
        notify('Đã bật chế độ Quản trị viên & Chỉnh sửa trực tiếp.', 'success');
        return { ok: true };
      } catch {
        return { ok: false, error: 'Không thể kết nối máy chủ xác thực.' };
      }
    },
    [notify]
  );

  const setupAdmin = useCallback(
    async (name: string, password: string) => {
      try {
        const res = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminName: name, password }),
        });
        const json = (await res.json()) as { ok?: boolean; adminName?: string; token?: string; error?: string };
        if (!res.ok) {
          return { ok: false, error: json.error || 'Thiết lập tài khoản thất bại.' };
        }
        setStoredAdminToken(json.token);
        setAuthConfigured(true);
        setIsAdmin(true);
        setAdminName(json.adminName || name);
        notify('Đã thiết lập tài khoản Quản trị và đăng nhập thành công.', 'success');
        return { ok: true };
      } catch {
        return { ok: false, error: 'Không thể kết nối máy chủ.' };
      }
    },
    [notify]
  );

  const logoutAdmin = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: getAdminAuthHeaders() });
    } finally {
      clearStoredAdminToken();
      setIsAdmin(false);
      setAdminName(null);
      if (activeTab === 'admin') {
        setActiveTab('home');
      }
      notify('Đã thoát chế độ Quản trị viên.', 'info');
    }
  }, [activeTab, notify]);

  const restoreFromPackage = useCallback(
    async (nextDb: MemoirDatabase, reason = 'Trước khi nhập gói sao lưu JSON') => {
      await savePreRestoreBackup(dataRef.current, reason);
      await refreshBackups();

      setHistoryPast((past) => [...past.slice(-(MAX_HISTORY - 1)), dataRef.current]);
      setHistoryFuture([]);
      setData(nextDb);
      await persistDatabase(nextDb, true);
      notify('Đã tạo bản sao lưu an toàn và phục hồi toàn bộ dữ liệu thành công.', 'success');
    },
    [notify, persistDatabase, refreshBackups]
  );

  const restoreFromSnapshot = useCallback(
    async (snapshotId: string) => {
      const target = backups.find((b) => b.id === snapshotId);
      if (!target) {
        notify('Không tìm thấy bản sao lưu đã chọn.', 'error');
        return;
      }
      await savePreRestoreBackup(dataRef.current, 'Trước khi khôi phục điểm lưu');
      setData(target.data);
      await persistDatabase(target.data, true);
      await refreshBackups();
      notify('Đã khôi phục dữ liệu từ điểm sao lưu an toàn.', 'success');
    },
    [backups, notify, persistDatabase, refreshBackups]
  );

  const clearSampleData = useCallback(async () => {
    await savePreRestoreBackup(dataRef.current, 'Trước khi xóa dữ liệu mẫu ban đầu');
    await refreshBackups();

    const current = dataRef.current;
    const cleaned: MemoirDatabase = {
      ...current,
      lastModified: new Date().toISOString(),
      home: {
        ...current.home,
        dataOrigin: 'real',
        history: {
          ...current.home.history,
          foundingContent:
            current.home.dataOrigin === 'sample'
              ? 'Ban Quản trị đang cập nhật tư liệu lịch sử hình thành chính thức của Chi đoàn Cù Chính Lan.'
              : current.home.history.foundingContent,
          stages: current.home.dataOrigin === 'sample' ? [] : current.home.history.stages,
          achievementsSummary:
            current.home.dataOrigin === 'sample'
              ? 'Đang cập nhật thành tích chính thức qua các nhiệm kỳ.'
              : current.home.history.achievementsSummary,
        },
      },
      milestones: current.milestones.filter((m) => m.dataOrigin !== 'sample'),
      leaderMessages: current.leaderMessages.filter((l) => l.dataOrigin !== 'sample'),
      cohorts: (current.cohorts || []).filter((c) => c.dataOrigin !== 'sample'),
      members: current.members.filter((m) => m.dataOrigin !== 'sample'),
      events: current.events.filter((e) => e.dataOrigin !== 'sample'),
      settings: {
        ...current.settings,
        showSampleBanner: false,
      },
    };

    setHistoryPast((past) => [...past.slice(-(MAX_HISTORY - 1)), current]);
    setHistoryFuture([]);
    setData(cleaned);
    await persistDatabase(cleaned, true);
    notify('Đã gỡ bỏ toàn bộ dữ liệu mẫu minh họa để sẵn sàng nhập tư liệu thực tế.', 'success');
  }, [notify, persistDatabase, refreshBackups]);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      updateData((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          ...patch,
        },
      }));
    },
    [updateData]
  );

  return (
    <MemoirContext.Provider
      value={{
        data,
        activeTab,
        setActiveTab,
        isLoading,
        isSaving,
        lastSavedAt,
        isAdmin,
        adminName,
        authConfigured,
        aiConfigured,
        canUndo: historyPast.length > 0,
        canRedo: historyFuture.length > 0,
        pendingMemberIds,
        toasts,
        backups,
        notify,
        dismissToast,
        updateData,
        updateSelfMemberProfile,
        publishMemberUpdate,
        undo,
        redo,
        syncNow,
        refreshAuth,
        loginAdmin,
        setupAdmin,
        logoutAdmin,
        restoreFromPackage,
        restoreFromSnapshot,
        clearSampleData,
        updateSettings,
      }}
    >
      {children}
    </MemoirContext.Provider>
  );
}

export function useMemoir(): MemoirContextValue {
  const ctx = useContext(MemoirContext);
  if (!ctx) {
    throw new Error('useMemoir must be used inside MemoirProvider.');
  }
  return ctx;
}
