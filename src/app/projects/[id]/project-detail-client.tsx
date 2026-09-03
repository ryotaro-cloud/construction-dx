"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type ProjectStatus = "未着手" | "進行中" | "完了" | "遅延";
type PhaseStatus = "未着手" | "進行中" | "完了";

type Project = {
  projectName: string;
  siteName: string;
  manager: string;
  startDate: string;
  dueDate: string;
  progress: number;
  status: ProjectStatus;
};

type Phase = {
  id: string;
  name: string;
  progress: number;
  status: PhaseStatus;
  plannedStartDate: string;
  plannedEndDate: string;
  note: string;
};

type PhaseForm = Omit<Phase, "id">;

const emptyPhaseForm: PhaseForm = {
  name: "",
  progress: 0,
  status: "未着手",
  plannedStartDate: "",
  plannedEndDate: "",
  note: "",
};

const phaseStatusStyles: Record<PhaseStatus, string> = {
  未着手: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
  進行中: "bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-200",
  完了: "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200",
};

const projectStatusStyles: Record<ProjectStatus, string> = {
  未着手: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
  進行中: "bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-200",
  完了: "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  遅延: "bg-red-100 text-red-700 ring-1 ring-inset ring-red-200",
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  if (value.includes("/")) return value;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
};

const toInputDate = (value: string | null | undefined) => {
  if (!value || value === "-") return "";
  return value.includes("/") ? value.replace(/\//g, "-") : value;
};

const resolvePhaseStatus = (progress: number, currentStatus: PhaseStatus): PhaseStatus => {
  if (progress <= 0) return "未着手";
  if (progress >= 100) return "完了";
  return currentStatus === "未着手" || currentStatus === "完了" ? "進行中" : currentStatus;
};

const isPhaseDelayed = (phase: Phase) => {
  if (!phase.plannedEndDate || phase.progress >= 100) return false;
  const endDate = new Date(`${phase.plannedEndDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(endDate.getTime()) && endDate < today;
};

const isBigIntId = (value: string) => /^\d+$/.test(value.trim());

const calculatePhaseProgress = (phases: Phase[]) => {
  if (phases.length === 0) return 0;
  return Math.round(phases.reduce((total, phase) => total + phase.progress, 0) / phases.length);
};

const resolveProjectStatus = (progress: number, dueDate: string) => {
  if (dueDate) {
    const due = new Date(`${dueDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!Number.isNaN(due.getTime()) && due < today && progress < 100) return "遅延" as const;
  }
  if (progress <= 0) return "未着手" as const;
  if (progress >= 100) return "完了" as const;
  return "進行中" as const;
};

const formatSupabaseError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const details = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };

  return [
    details.message,
    details.code ? `code: ${details.code}` : "",
    details.details ? `details: ${details.details}` : "",
    details.hint ? `hint: ${details.hint}` : "",
  ].filter(Boolean).join(" / ") || JSON.stringify(error);
};

export default function ProjectDetailClient({ project, projectId }: { project: Project; projectId: string }) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [phaseForm, setPhaseForm] = useState<PhaseForm>(emptyPhaseForm);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [phaseToDelete, setPhaseToDelete] = useState<Phase | null>(null);
  const [overallProgress, setOverallProgress] = useState(project.progress);
  const [overallStatus, setOverallStatus] = useState<ProjectStatus>(project.status);

  const loadPhases = async (): Promise<Phase[]> => {
    setIsLoading(true);
    setErrorMessage("");

    if (!isBigIntId(projectId)) {
      setErrorMessage("案件IDが正しくありません。");
      setIsLoading(false);
      return [];
    }

    const { data, error } = await createClient()
      .from("construction_phases")
      .select("id, name, progress, status, planned_start_date, planned_end_date, note")
      .eq("project_id", projectId.trim())
      .order("planned_start_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase phase fetch error:", formatSupabaseError(error), error);
      setErrorMessage(`工程の取得に失敗しました: ${formatSupabaseError(error)}`);
      setIsLoading(false);
      return [];
    }

    const mappedPhases = (data ?? []).map((phase) => ({
      id: String(phase.id),
      name: phase.name,
      progress: Number(phase.progress ?? 0),
      status: resolvePhaseStatus(Number(phase.progress ?? 0), phase.status as PhaseStatus),
      plannedStartDate: phase.planned_start_date ?? "",
      plannedEndDate: phase.planned_end_date ?? "",
      note: phase.note ?? "",
    }));
    setPhases(mappedPhases);
    const progress = calculatePhaseProgress(mappedPhases);
    setOverallProgress(progress);
    setOverallStatus(resolveProjectStatus(progress, toInputDate(project.dueDate)));
    setIsLoading(false);
    return mappedPhases;
  };

  useEffect(() => {
    void loadPhases();
  }, [projectId]);

  const handlePhaseInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setPhaseForm((previous) => {
      const next = { ...previous, [name]: name === "progress" ? Number(value) : value } as PhaseForm;
      if (name === "progress") next.status = resolvePhaseStatus(next.progress, next.status);
      return next;
    });
  };

  const openAddForm = () => {
    setEditingPhaseId(null);
    setPhaseForm(emptyPhaseForm);
    setMessage("");
    setErrorMessage("");
    setIsFormOpen(true);
  };

  const openEditForm = (phase: Phase) => {
    setEditingPhaseId(phase.id);
    setPhaseForm({
      name: phase.name,
      progress: phase.progress,
      status: phase.status,
      plannedStartDate: phase.plannedStartDate,
      plannedEndDate: phase.plannedEndDate,
      note: phase.note,
    });
    setMessage("");
    setErrorMessage("");
    setIsFormOpen(true);
  };

  const cancelForm = () => {
    setIsFormOpen(false);
    setEditingPhaseId(null);
    setPhaseForm(emptyPhaseForm);
  };

  const handlePhaseSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const progress = Math.min(Math.max(Number(phaseForm.progress), 0), 100);
    const name = phaseForm.name.trim();

    if (!name) {
      setErrorMessage("工程名を入力してください。");
      return;
    }
    if (phaseForm.plannedStartDate && phaseForm.plannedEndDate && phaseForm.plannedEndDate < phaseForm.plannedStartDate) {
      setErrorMessage("完了予定日は開始予定日より前に設定できません。");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setMessage("");
    const status = resolvePhaseStatus(progress, phaseForm.status);
    const payload = {
      name,
      progress,
      status,
      planned_start_date: phaseForm.plannedStartDate || null,
      planned_end_date: phaseForm.plannedEndDate || null,
      note: phaseForm.note.trim() || null,
    };

    const query = editingPhaseId
      ? createClient().from("construction_phases").update(payload).eq("id", editingPhaseId).eq("project_id", projectId.trim())
      : createClient().from("construction_phases").insert({ ...payload, project_id: projectId.trim() });
    const { error } = await query;

    if (error) {
      console.error("Supabase phase save error:", formatSupabaseError(error), error);
      setErrorMessage(`工程の保存に失敗しました: ${formatSupabaseError(error)}`);
    } else {
      setMessage(editingPhaseId ? "工程を更新しました。" : "工程を登録しました。");
      cancelForm();
      const latestPhases = await loadPhases();
      await syncProjectSummary(latestPhases);
    }
    setIsSaving(false);
  };

  const syncProjectSummary = async (latestPhases: Phase[]) => {
    const progress = calculatePhaseProgress(latestPhases);
    const status = resolveProjectStatus(progress, toInputDate(project.dueDate));
    const { error } = await createClient().from("projects").update({ progress, status }).eq("id", projectId.trim());

    if (error) {
      console.error("Supabase project summary update error:", formatSupabaseError(error), error);
      setErrorMessage(`案件全体の進捗同期に失敗しました: ${formatSupabaseError(error)}`);
    }
  };

  const handleDeletePhase = async () => {
    if (!phaseToDelete || isSaving) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setMessage("");
    const { error } = await createClient()
      .from("construction_phases")
      .delete()
      .eq("id", phaseToDelete.id)
      .eq("project_id", projectId.trim());

    if (error) {
      console.error("Supabase phase delete error:", formatSupabaseError(error), error);
      setErrorMessage(`工程の削除に失敗しました: ${formatSupabaseError(error)}`);
    } else {
      setPhaseToDelete(null);
      setMessage("工程を削除しました。");
      const latestPhases = await loadPhases();
      await syncProjectSummary(latestPhases);
    }
    setIsSaving(false);
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-800 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Construction DX</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">工事案件詳細</h1>
            <p className="mt-1 text-sm text-slate-500">案件の進捗と工程状況を確認</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/?edit=${projectId}`} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800">編集</Link>
            <Link href="/" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">一覧へ戻る</Link>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
            <div>
              <p className="text-xs font-semibold text-slate-500">案件名</p>
              <h2 className="mt-1 break-words text-2xl font-bold text-slate-950">{project.projectName}</h2>
              <p className="mt-1 text-sm text-slate-500">{project.siteName}</p>
            </div>
            <span className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${projectStatusStyles[overallStatus]}`}>{overallStatus}</span>
          </div>
          <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-7 lg:grid-cols-4">
            <div><p className="text-xs font-semibold text-slate-500">担当者</p><p className="mt-1 font-medium text-slate-800">{project.manager}</p></div>
            <div><p className="text-xs font-semibold text-slate-500">開始日</p><p className="mt-1 font-medium text-slate-800">{project.startDate}</p></div>
            <div><p className="text-xs font-semibold text-slate-500">完了予定日</p><p className="mt-1 font-medium text-slate-800">{project.dueDate}</p></div>
            <div><p className="text-xs font-semibold text-slate-500">全体進捗</p><p className="mt-1 text-2xl font-bold text-slate-950">{overallProgress}%</p></div>
          </div>
          <div className="px-5 pb-6 sm:px-7"><div className="h-3 w-full overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${overallStatus === "遅延" ? "bg-red-500" : overallStatus === "完了" ? "bg-emerald-500" : overallStatus === "未着手" ? "bg-slate-400" : "bg-blue-500"}`} style={{ width: `${Math.min(Math.max(overallProgress, 0), 100)}%` }} /></div></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-5 sm:px-7">
            <div><h2 className="text-xl font-bold text-slate-950">工程進捗</h2><p className="mt-1 text-sm text-slate-500">現場担当者が入力した工程情報を確認できます</p></div>
            <button type="button" onClick={openAddForm} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800">工程を追加</button>
          </div>

          {message ? <div className="mx-5 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:mx-7">{message}</div> : null}
          {errorMessage ? <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-7">{errorMessage}</div> : null}

          {isFormOpen ? (
            <form onSubmit={handlePhaseSubmit} className="m-4 grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:m-5 sm:grid-cols-2 sm:p-5">
              <h3 className="text-lg font-bold text-slate-900 sm:col-span-2">{editingPhaseId ? "工程を編集" : "工程を追加"}</h3>
              <label><span className="mb-1 block text-sm font-medium text-slate-700">工程名 *</span><input name="name" value={phaseForm.name} onChange={handlePhaseInputChange} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" /></label>
              <label><span className="mb-1 block text-sm font-medium text-slate-700">ステータス</span><select name="status" value={phaseForm.status} onChange={handlePhaseInputChange} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"><option value="未着手">未着手</option><option value="進行中">進行中</option><option value="完了">完了</option></select></label>
              <label><span className="mb-1 block text-sm font-medium text-slate-700">開始予定日</span><input type="date" name="plannedStartDate" value={phaseForm.plannedStartDate} onChange={handlePhaseInputChange} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" /></label>
              <label><span className="mb-1 block text-sm font-medium text-slate-700">完了予定日</span><input type="date" name="plannedEndDate" value={phaseForm.plannedEndDate} onChange={handlePhaseInputChange} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" /></label>
              <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">進捗率: {phaseForm.progress}%</span><input type="range" min="0" max="100" step="1" name="progress" value={phaseForm.progress} onChange={handlePhaseInputChange} className="h-2 w-full cursor-pointer accent-blue-600" /></label>
              <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">備考</span><textarea name="note" value={phaseForm.note} onChange={handlePhaseInputChange} rows={3} className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" /></label>
              <div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:justify-end"><button type="button" onClick={cancelForm} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">キャンセル</button><button type="submit" disabled={isSaving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">{isSaving ? "保存中..." : "保存"}</button></div>
            </form>
          ) : null}

          {isLoading ? <div className="px-5 py-10 text-center text-slate-500">工程を読み込んでいます...</div> : phases.length === 0 ? <div className="px-5 py-10 text-center text-slate-500">工程がまだ登録されていません</div> : (
            <div className="divide-y divide-slate-200">
              {phases.map((phase) => {
                const delayed = isPhaseDelayed(phase);
                return <div key={phase.id} className={`grid gap-4 px-5 py-5 sm:grid-cols-[minmax(130px,1fr)_minmax(180px,2fr)_auto_auto] sm:items-center sm:px-7 ${delayed ? "border-l-4 border-l-red-400 bg-red-50/60" : ""}`}>
                  <div><p className="font-semibold text-slate-900">{phase.name}</p>{delayed ? <p className="mt-1 text-xs font-semibold text-red-700">要確認: 予定日超過</p> : null}</div>
                  <div className="flex items-center gap-3"><div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${phase.status === "完了" ? "bg-emerald-500" : phase.status === "進行中" ? "bg-blue-500" : "bg-slate-400"}`} style={{ width: `${phase.progress}%` }} /></div><span className="w-12 text-right text-sm font-semibold text-slate-700">{phase.progress}%</span></div>
                  <div className="text-xs text-slate-500 sm:min-w-32"><p>開始 {formatDate(phase.plannedStartDate)}</p><p className="mt-1">完了 {formatDate(phase.plannedEndDate)}</p></div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${delayed ? "bg-red-100 text-red-700 ring-1 ring-inset ring-red-200" : phaseStatusStyles[phase.status]}`}>{delayed ? "要確認" : phase.status}</span><button type="button" onClick={() => openEditForm(phase)} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">編集</button><button type="button" onClick={() => setPhaseToDelete(phase)} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">削除</button></div>
                  {phase.note ? <p className="text-sm text-slate-600 sm:col-span-4"><span className="font-semibold text-slate-500">備考:</span> {phase.note}</p> : null}
                </div>;
              })}
            </div>
          )}
        </section>

        {phaseToDelete ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="presentation" onClick={() => { if (!isSaving) setPhaseToDelete(null); }}>
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="phase-delete-dialog-title" onClick={(event) => event.stopPropagation()}>
              <h2 id="phase-delete-dialog-title" className="text-xl font-bold text-slate-900">工程を削除しますか？</h2>
              <p className="mt-3 break-words text-sm leading-6 text-slate-600">「{phaseToDelete.name}」を削除します。この操作は取り消せません。</p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" disabled={isSaving} onClick={() => setPhaseToDelete(null)} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">キャンセル</button>
                <button type="button" disabled={isSaving} onClick={() => void handleDeletePhase()} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{isSaving ? "削除中..." : "削除する"}</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
