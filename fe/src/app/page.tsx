"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMatchBackendAdapter, type MatchImportStatus, type MatchListItem } from "@/lib/backend";
import { PREDEFINED_HYPOTHESIS_COUNT } from "@/lib/hypothesis-library";

const STATUS_LABELS: Record<MatchImportStatus, string> = {
  awaiting_upload: "업로드 대기",
  pending_ocr: "OCR 대기",
  processing_ocr: "OCR 처리 중",
  needs_review: "검수 필요",
  confirmed: "완료",
  failed: "오류",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default function DashboardPage() {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getMatchBackendAdapter()
      .listMatchImports()
      .then((items) => {
        if (mounted) setMatches(items);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const needsAction = matches.filter((m) => m.status === "needs_review" || m.status === "failed").length;
    const ocr = matches.filter((m) => m.status === "pending_ocr" || m.status === "processing_ocr").length;
    const confirmedMatches = matches.filter((m) => m.status === "confirmed");
    const decided = confirmedMatches.filter((m) => m.editable.result === "win" || m.editable.result === "loss");
    const wins = decided.filter((m) => m.editable.result === "win").length;
    const winRate = decided.length > 0 ? Math.round((wins / decided.length) * 100) : null;
    return { total: matches.length, needsAction, ocr, confirmed: confirmedMatches.length, winRate };
  }, [matches]);

  const recent = matches.slice(0, 5);

  return (
    <main className="orca-light min-h-screen bg-white px-5 py-10 text-[#171A20] md:px-8 md:py-14">
      <div className="mx-auto max-w-[1240px]">
        <section className="mb-12 flex min-h-[38vh] flex-col justify-center gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mb-3 text-[13px] font-medium text-[#5C5E62]">대시보드</p>
            <h1 className="m-0 max-w-3xl text-4xl font-medium leading-[1.15] md:text-[40px]">경기 수집부터 분석 준비까지</h1>
            <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#5C5E62]">
              등록, OCR, 검수, 확정 상태를 확인하고 바로 다음 작업으로 이동합니다.
            </p>
          </div>
          <Link
            href="/matches/new"
            className="w-fit rounded-[4px] bg-[#3E6AE1] px-6 py-3 text-[14px] font-medium text-white no-underline hover:bg-[#345BC2]"
          >
            + 새 경기 등록
          </Link>
        </section>

        <section className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-5">
          <MetricCard label="전체 경기" value={String(stats.total)} />
          <MetricCard label="확인 필요" value={String(stats.needsAction)} warning={stats.needsAction > 0} />
          <MetricCard label="OCR 대기/처리" value={String(stats.ocr)} />
          <MetricCard label="분석 가능" value={String(stats.confirmed)} accent />
          <MetricCard label="확정 승률" value={stats.winRate === null ? "-" : `${stats.winRate}%`} />
        </section>

        <div className="grid gap-8 xl:grid-cols-[1.45fr_0.75fr]">
          <section className="overflow-hidden rounded-[12px] bg-[#F4F4F4]">
            <div className="flex items-center justify-between px-5 py-5">
              <div>
                <p className="m-0 text-[17px] font-medium text-[#171A20]">최근 경기</p>
                <p className="mt-1 text-[10px] text-[#5C5E62]">가장 최근에 등록한 경기 5건</p>
              </div>
              <Link href="/matches" className="text-xs font-medium text-[#3E6AE1] no-underline hover:text-[#171A20]">전체 보기 →</Link>
            </div>

            {loading ? (
              <div className="px-5 py-12 text-center text-sm text-[#5C5E62]">불러오는 중...</div>
            ) : recent.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="m-0 text-sm font-medium">아직 등록된 경기가 없습니다</p>
                <p className="mt-2 text-xs text-[#5C5E62]">첫 경기를 등록하면 최근 경기와 상태가 여기에 표시됩니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#EEEEEE]">
                {recent.map((match) => (
                  <Link
                    key={match.match_id}
                    href={`/matches/${match.match_id}`}
                    className="flex flex-col gap-3 px-5 py-4 text-[#171A20] no-underline transition hover:bg-[#EEEEEE] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="m-0 text-sm font-medium text-[#171A20]">{formatDate(match.editable.played_at || match.detected_at)}</p>
                        <span className="text-xs font-medium text-[#3E6AE1]">{match.editable.map_name || "맵 미확인"}</span>
                        {match.editable.my_hero && <span className="text-[10px] text-[#5C5E62]">{match.editable.my_hero}</span>}
                      </div>
                      <p className="mt-1 text-[10px] text-[#5C5E62]">
                        이미지 {match.files.length}장 · {match.match_id.slice(0, 12)}...
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-[#EEEEEE] bg-white px-2.5 py-1 text-[10px] font-medium text-[#5C5E62]">
                        {STATUS_LABELS[match.status]}
                      </span>
                      <span className="text-[10px] text-[#5C5E62]">
                        {match.status === "confirmed" ? "분석 가능" : "처리 진행 중"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className="rounded-[12px] bg-[#F4F4F4] p-5">
              <p className="m-0 text-sm font-medium">빠른 이동</p>
              <div className="mt-4 space-y-2">
                <QuickLink href="/matches/new" title="경기 등록" text="새 스크린샷 자동 분류" />
                <QuickLink href="/matches" title="경기 목록" text="상세 · 수정 · 삭제 · OCR 검수" />
                <QuickLink href="/analysis" title="분석" text="확정 경기 기반 기초 분석" />
                <QuickLink href="/insights" title="인사이트" text="최근 변화와 다음 검증 포인트" />
                <QuickLink href="/hypotheses" title="가설" text={`사전 가설 Library ${PREDEFINED_HYPOTHESIS_COUNT}개`} />
              </div>
            </section>

            <section className="rounded-[12px] bg-[#F4F4F4] p-5">
              <p className="m-0 text-[17px] font-medium text-[#171A20]">ORCA 파이프라인</p>
              <div className="mt-4 space-y-2">
                <PipelineStep label="1. 스크린샷 수집 / 분류" state="done" />
                <PipelineStep label="2. 업로드 / 저장" state="mock" />
                <PipelineStep label="3. OCR 구조화" state="mock" />
                <PipelineStep label="4. 사용자 검수" state="done" />
                <PipelineStep label="5. 분석 / 가설 검증" state="partial" />
                <PipelineStep label="6. AI 인사이트" state="partial" />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function MetricCard({ label, value, accent = false, warning = false }: { label: string; value: string; accent?: boolean; warning?: boolean }) {
  const valueClass = warning ? "text-[#393C41]" : accent ? "text-[#3E6AE1]" : "text-[#171A20]";
  return (
    <div className="rounded-[12px] bg-[#F4F4F4] p-4 md:p-5">
      <p className="m-0 text-[11px] text-[#5C5E62]">{label}</p>
      <p className={`mb-0 mt-2 text-3xl font-medium ${valueClass}`}>{value}</p>
    </div>
  );
}

function PipelineStep({ label, state }: { label: string; state: "done" | "mock" | "partial" }) {
  const meta = {
    done: { text: "FE 완료", className: "text-[#393C41]" },
    mock: { text: "Mock", className: "text-[#3E6AE1]" },
    partial: { text: "준비 중", className: "text-[#5C5E62]" },
  }[state];

  return (
    <div className="flex items-center justify-between gap-3 rounded-[4px] bg-white px-3 py-2.5">
      <span className="text-[10px] font-medium text-[#171A20]">{label}</span>
      <span className={`text-[9px] font-medium ${meta.className}`}>{meta.text}</span>
    </div>
  );
}

function QuickLink({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="block rounded-[4px] bg-white px-3.5 py-3 no-underline hover:bg-[#EEEEEE]">
      <span className="block text-xs font-medium text-[#171A20]">{title}</span>
      <span className="mt-1 block text-[10px] text-[#5C5E62]">{text}</span>
    </Link>
  );
}
