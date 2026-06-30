import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123456");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.login({ username, password });
      navigate("/projects", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-ink">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-panel">
        <div className="mb-6">
          <div className="mb-2 text-2xl font-bold tracking-normal">XM</div>
          <p className="text-sm text-muted">登录后管理项目、缺陷和功能事项。</p>
        </div>
        {error ? <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <label className="mb-4 block text-sm font-medium text-ink">
          用户名
          <input value={username} onChange={(event) => setUsername(event.target.value)} className="input mt-1" />
        </label>
        <label className="mb-5 block text-sm font-medium text-ink">
          密码
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input mt-1"
          />
        </label>
        <button
          disabled={loading}
          className="focus-ring h-10 w-full rounded-md bg-feature text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
        >
          登录
        </button>
      </form>
    </main>
  );
}
