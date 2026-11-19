import React, { useState } from 'react';
import { KeyRound, SlidersHorizontal, X } from 'lucide-react';
import { useMemoir } from '../../context/MemoirContext';
import { getAdminAuthHeaders, setStoredAdminToken } from '../../services/authToken';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { data, updateSettings, isAdmin, adminName, notify, refreshAuth } = useMemoir();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [nextAdminName, setNextAdminName] = useState(adminName || 'Ban Quản trị Chi đoàn');
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  if (!isOpen) return null;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    setSavingPw(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          adminName: nextAdminName,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; token?: string; error?: string };
      if (!res.ok) {
        if (res.status === 401) {
          await refreshAuth();
        }
        setPwMsg({ type: 'err', text: json.error || 'Không thể đổi mật khẩu.' });
      } else {
        setStoredAdminToken(json.token);
        await refreshAuth();
        setPwMsg({ type: 'ok', text: 'Đã cập nhật mật khẩu quản trị thành công.' });
        setCurrentPassword('');
        setNewPassword('');
        notify('Đã cập nhật thông tin bảo mật quản trị.', 'success');
      }
    } catch {
      setPwMsg({ type: 'err', text: 'Lỗi kết nối máy chủ.' });
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#171719] p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng cài đặt"
          className="absolute right-4 top-4 rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#242428] border border-white/10 text-zinc-200">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h2 id="settings-modal-title" className="text-xl font-semibold text-white">
              Cài đặt không gian Hồi ký
            </h2>
            <p className="text-xs text-zinc-400">Tùy chỉnh giao diện, tự động lưu và cấu hình quản trị.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-[#242428] p-4 space-y-4">
            <div>
              <div className="text-sm font-medium text-white mb-2">Chế độ nền giao diện</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateSettings({ themeMode: 'dark' })}
                  className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors cursor-pointer ${
                    data.settings.themeMode === 'dark'
                      ? 'border-[#F02028] bg-[#F02028]/15 text-white'
                      : 'border-white/10 bg-[#171719] text-zinc-400 hover:text-white'
                  }`}
                >
                  Đen than chuẩn (#171719)
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ themeMode: 'neutral' })}
                  className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors cursor-pointer ${
                    data.settings.themeMode === 'neutral'
                      ? 'border-[#F02028] bg-[#F02028]/15 text-white'
                      : 'border-white/10 bg-[#171719] text-zinc-400 hover:text-white'
                  }`}
                >
                  Xám trung tính sáng hơn
                </button>
              </div>
            </div>

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-white">Tự động lưu khi chỉnh sửa</div>
                <div className="text-xs text-zinc-400">Ghi xuống IndexedDB và đồng bộ máy chủ ngay lập tức.</div>
              </div>
              <input
                type="checkbox"
                checked={data.settings.autoSaveEnabled}
                onChange={(e) => updateSettings({ autoSaveEnabled: e.target.checked })}
                className="h-4 w-4 accent-[#F02028]"
              />
            </label>

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-white">Hiển thị nhãn phân biệt dữ liệu mẫu</div>
                <div className="text-xs text-zinc-400">Đánh dấu rõ hồ sơ minh họa và tư liệu chính thức.</div>
              </div>
              <input
                type="checkbox"
                checked={data.settings.showSampleBanner}
                onChange={(e) => updateSettings({ showSampleBanner: e.target.checked })}
                className="h-4 w-4 accent-[#F02028]"
              />
            </label>
          </div>

          {isAdmin && (
            <form
              onSubmit={handlePasswordChange}
              className="rounded-xl border border-white/10 bg-[#242428] p-4 space-y-3"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <KeyRound className="w-4 h-4 text-[#F02028]" />
                Đổi mật khẩu & Tên tài khoản Quản trị
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Tên quản trị viên</label>
                <input
                  type="text"
                  value={nextAdminName}
                  onChange={(e) => setNextAdminName(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#171719] px-3 py-2 text-sm text-white focus:border-[#F02028] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Mật khẩu hiện tại</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full rounded-lg border border-white/10 bg-[#171719] px-3 py-2 text-sm text-white focus:border-[#F02028] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Mật khẩu mới (≥ 6 ký tự)</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-lg border border-white/10 bg-[#171719] px-3 py-2 text-sm text-white focus:border-[#F02028] focus:outline-none"
                  />
                </div>
              </div>
              {pwMsg && (
                <div
                  className={`text-xs rounded-lg px-3 py-2 ${
                    pwMsg.type === 'ok'
                      ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
                      : 'bg-[#F02028]/15 text-red-200 border border-[#F02028]/40'
                  }`}
                >
                  {pwMsg.text}
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingPw}
                  className="rounded-lg bg-[#F02028] px-4 py-2 text-xs font-semibold text-white hover:bg-[#d91b23] disabled:opacity-60 cursor-pointer"
                >
                  {savingPw ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
