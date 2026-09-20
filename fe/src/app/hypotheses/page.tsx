"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type HypothesisStatus = "draft" | "active" | "archived";

type Hypothesis = {
  id: string;
  title: string;
  statement: string;
  status: HypothesisStatus;
  created_at: string;
  updated_at: string;
};

const STORAGE_KEY = "ow-insight-hypotheses:v1";

const STATUS_META: Record<HypothesisStatus, { label: string; className: string }> = {
  draft: { label: "초안", className: "bg-[#171e2a] text-[var(--muted)]" },
  active: { label: "검증 중", className: "bg-[rgba(102,169,255,0.14)] text-[#8fc1ff]" },
  archived: { label: "보관", className: "bg-[rgba(121,227,156,0.10)] text-[#8ee9aa]" },
};

function loadHypotheses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Hypothesis[]) : [];
  } catch {
    return [];
  }
}

function saveHypotheses(items: Hypothesis[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default function HypothesesPage() {
  const [items, setItems] = useState<Hypothesis[]>([]);
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [filter, setFilter] = useState<"all" | HypothesisStatus>("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setItems(loadHypotheses());
  }, []);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.status === filter)),
    [filter, items],
  );

  function commit(next: Hypothesis[]) {
    setItems(next);
    saveHypotheses(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanStatement = statement.trim();
    if (!cleanTitle || !cleanStatement) return;

    const now = new Date().toISOString();

    if (editingId) {
      commit(
        items.map((item) =>
          item.id === editingId
            ? { ...item, title: cleanTitle, statement: cleanStatement, updated_at: now }
            : item,
        ),
      );
      setEditingId(null);
    } else {
      commit([
        {
          id: crypto.randomUUID(),
          title: cleanTitle,
          statement: cleanStatement,
          status: "draft",
          created_at: now,
          updated_at: now,
        },
        ...items,
      ]);
    }

    setTitle("");
    setStatement("");
  }

  function edit(item: Hypothesis) {
    setEditingId(item.id);
    setTitle(item.title);
    setStatement(item.statement);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setTitle("");
    setStatement("");
  }

  function changeStatus(id: string, status: HypothesisStatus) {
    const now = new Date().toISOString();
    commit(items.map((item) => (item.id === id ? { ...item, status, updated_at: now } : item)));
  }

  function remove(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    if (!window.confirm(`'${item.title}' 가설을 삭제할까요?`)) return;
    commit(items.filter((candidate) => candidate.id !== id));
    if (editingId === id) cancelEdit();
  }

  return (
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1240px]">
        <section className="mb-7">
          <p className="mb-2 text-sm font-semibold text-[var(--orange)]">가설</p>
          <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] md:text-4xl">검증할 가설을 관리합니다</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            지금은 브라우저에 초안과 상태를 저장합니다. 이후 실제 분석 결과와 hypothesis_runs를 연결할 예정입니다.
          </p>
        </section>

        <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <div className="mb-4">
              <p className="m-0 text-sm font-bold">{editingId ? "가설 수정" : "새 가설"}</p>
              <p className="mt-1 text-[10px] text-[var(--muted)]">검증하고 싶은 문장을 간단히 적어두세요.</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <label>
                <span className="mb-2 block text-[11px] font-bold text-[var(--muted)]">제목</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="예: 아나가 있을 때 승률이 높은가?"
                  className="field-input"
                />
              </label>
              <label>
                <span className="mb-2 block text-[11px] font-bold text-[var(--muted)]">가설 문장</span>
                <textarea
                  value={statement}
                  onChange={(event) => setStatement(event.target.value)}
                  placeholder="예: 우리 팀에 아나가 포함된 경기의 승률이 그렇지 않은 경기보다 높을 것이다."
                  rows={7}
                  className="field-input resize-y"
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!title.trim() || !statement.trim()}
                  className="flex-1 cursor-pointer rounded-xl bg-[var(--orange)] px-4 py-3 text-xs font-black text-black disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {editingId ? "수정 저장" : "가설 추가"}
                </button>
                {editingId && (
                  <button type="button" onClick={cancelEdit} className="cursor-pointer rounded-xl border border-[var(--line)] px-4 py-3 text-xs font-bold text-white">
                    취소
                  </button>
                )}
              </div>
            </form>

            <div className="mt-5 rounded-xl border border-[rgba(102,169,255,0.25)] bg-[rgba(102,169,255,0.06)] p-4">
              <p className="m-0 text-xs font-bold text-[#9bc6ff]">좋은 가설 형태</p>
              <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">조건과 비교 대상을 함께 적으면 나중에 자동 분석 규칙으로 바꾸기 쉽습니다.</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>전체 {items.length}</FilterButton>
                <FilterButton active={filter === "draft"} onClick={() => setFilter("draft")}>초안 {items.filter((i) => i.status === "draft").length}</FilterButton>
                <FilterButton active={filter === "active"} onClick={() => setFilter("active")}>검증 중 {items.filter((i) => i.status === "active").length}</FilterButton>
                <FilterButton active={filter === "archived"} onClick={() => setFilter("archived")}>보관 {items.filter((i) => i.status === "archived").length}</FilterButton>
              </div>
              <span className="text-[10px] text-[var(--muted)]">브라우저 Mock 저장</span>
            </div>

            {visible.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="m-0 text-sm font-bold">가설이 없습니다</p>
                <p className="mt-2 text-xs text-[var(--muted)]">왼쪽에서 첫 가설을 만들어 보세요.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {visible.map((item) => {
                  const meta = STATUS_META[item.status];
                  return (
                    <article key={item.id} className="px-5 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="m-0 text-sm font-bold text-white">{item.title}</h2>
                            <span className={`rounded-full px-2 py-1 text-[9px] font-black ${meta.className}`}>{meta.label}</span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-[#c8d0dc]">{item.statement}</p>
                          <p className="mb-0 mt-2 text-[9px] text-[var(--muted)]">수정 {formatDate(item.updated_at)}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <select
                            value={item.status}
                            onChange={(event) => changeStatus(item.id, event.target.value as HypothesisStatus)}
                            className="rounded-lg border border-[var(--line)] bg-[#0d1118] px-2.5 py-2 text-[10px] font-bold text-white outline-none"
                          >
                            <option value="draft">초안</option>
                            <option value="active">검증 중</option>
                            <option value="archived">보관</option>
                          </select>
                          <button type="button" onClick={() => edit(item)} className="cursor-pointer rounded-lg border border-[var(--line)] px-3 py-2 text-[10px] font-bold text-white">수정</button>
                          <button type="button" onClick={() => remove(item.id)} className="cursor-pointer rounded-lg border border-[#503336] px-3 py-2 text-[10px] font-bold text-[#ff9b9b]">삭제</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-bold transition ${
        active
          ? "border-[rgba(249,158,26,0.45)] bg-[var(--orange-soft)] text-[var(--orange)]"
          : "border-[var(--line)] bg-[#0d1118] text-[var(--muted)] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
