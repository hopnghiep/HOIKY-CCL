import React, { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, X } from 'lucide-react';
import { useMemoir } from '../../context/MemoirContext';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminLoginModal({ isOpen, onClose }: AdminLoginModalProps) {
  const { authConfigured, loginAdmin, setupAdmin } = useMemoir();
  const [adminNameInput, setAdminNameInput] = useState('Ban Quản trị Chi đoàn');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!authConfigured) {
      if (password.length < 6) {
        setError('Mật khẩu quản trị cần tối thiểu 6 ký tự.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Mật khẩu xác nhận chưa trùng khớp.');
        return;
      }
      setSubmitting(true);
      const res = await setupAdmin(adminNameInput.trim() || 'Ban Quản trị Chi đoàn', password);
      setSubmitting(false);
      if (res.ok) {
        setPassword('');
        setConfirmPassword('');
        onClose();
      } else {
        setError(res.error || 'Không thể thiết lập tài khoản.');
      }
      return;
    }

    if (!password) {
      setError('Vui lòng nhập mật khẩu quản trị.');
      return;
    }

    setSubmitting(true);
    const res = await loginAdmin(password);
    setSubmitting(false);
    if (res.ok) {
      setPassword('');
      onClose();
    } else {
      setError(res.error || 'Mật khẩu không chính xác.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-login-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#171719] p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng đăng nhập"
          className="absolute right-4 top-4 rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F02028]/15 border border-[#F02028]/30 text-[#F02028]">
            {authConfigured ? <Lock className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div>
            <h2 id="admin-login-title" className="text-xl font-semibold text-white">
              {authConfigured ? 'Đăng nhập Quản trị viên' : 'Thiết lập Quản trị lần đầu'}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {authConfigured
                ? 'Xác thực quyền chỉnh sửa trực tiếp, quản lý tư liệu và sao lưu.'
                : 'Tạo mật khẩu quản trị riêng — không dùng mật khẩu cố định.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!authConfigured && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Tên hiển thị Quản trị viên
              </label>
              <input
                type="text"
                value={adminNameInput}
                onChange={(e) => setAdminNameInput(e.target.value)}
                required
                className="w-full rounded-xl border border-white/10 bg-[#242428] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-[#F02028] focus:outline-none"
                placeholder="VD: Ban Chấp hành Chi đoàn"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {authConfigured ? 'Mật khẩu quản trị' : 'Tạo mật khẩu quản trị (tối thiểu 6 ký tự)'}
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
                className="w-full rounded-xl border border-white/10 bg-[#242428] px-3.5 py-2.5 pr-11 text-sm text-white placeholder:text-zinc-500 focus:border-[#F02028] focus:outline-none"
                placeholder="Nhập mật khẩu..."
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-400 hover:text-white cursor-pointer"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!authConfigured && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Xác nhận mật khẩu quản trị
              </label>
              <input
                type={showPass ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-white/10 bg-[#242428] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-[#F02028] focus:outline-none"
                placeholder="Nhập lại mật khẩu..."
              />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-[#F02028]/50 bg-[#F02028]/10 px-3.5 py-2.5 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#F02028] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d91b23] disabled:opacity-60 transition-colors cursor-pointer"
            >
              {submitting
                ? 'Đang xác thực...'
                : authConfigured
                  ? 'Đăng nhập Admin'
                  : 'Lưu & Kích hoạt Admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
