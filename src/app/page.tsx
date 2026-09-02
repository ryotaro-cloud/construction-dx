"use client";

import { createClient } from "@/lib/supabase";
import { useEffect, useState } from "react";

type ProjectStatus = "進行中" | "完了" | "遅延";

type Project = {
  id: string;
  projectName: string;
  siteName: string;
  manager: string;
  startDate: string;
  dueDate: string;
  progress: number;
  status: ProjectStatus;
};

type ProjectFormState = {
  projectName: string;
  siteName: string;
  manager: string;
  startDate: string;
  dueDate: string;
  progress: number;
  status: ProjectStatus;
};

const emptyForm: ProjectFormState = {
  projectName: "",
  siteName: "",
  manager: "",
  startDate: "",
  dueDate: "",
  progress: 0,
  status: "進行中",
};

const statusStyles: Record<ProjectStatus, string> = {
  進行中: "bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-200",
  完了: "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  遅延: "bg-red-100 text-red-700 ring-1 ring-inset ring-red-200",
};

const progressStyles: Record<ProjectStatus, string> = {
  進行中: "bg-blue-500",
  完了: "bg-emerald-500",
  遅延: "bg-red-500",
};

const formatDateForInput = (value: string | null | undefined) => {
  if (!value) return "";
  if (value.includes("/")) {
    return value.replace(/\//g, "-");
  }
  return value;
};

const formatDateForDisplay = (value: string | null | undefined) => {
  if (!value) return "-";
  if (value.includes("/")) {
    return value;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
};

const resolveAutoStatus = (
  progress: number,
  dueDate: string | null | undefined
): ProjectStatus => {
  const numericProgress = Number.isFinite(progress) ? Number(progress) : 0;

  if (numericProgress >= 100) {
    return "完了";
  }

  if (!dueDate) {
    return "進行中";
  }

  const normalizedDueDate = formatDateForInput(dueDate);
  const due = new Date(`${normalizedDueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!Number.isNaN(due.getTime()) && due < today) {
    return "遅延";
  }

  return "進行中";
};

const normalizeStatus = (
  value: string | null | undefined,
  progress: number,
  dueDate: string | null | undefined
): ProjectStatus => {
  if (value === "完了") return "完了";
  if (value === "遅延") return "遅延";
  return resolveAutoStatus(progress, dueDate);
};

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [formData, setFormData] = useState<ProjectFormState>(emptyForm);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [detailFormData, setDetailFormData] = useState<ProjectFormState | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"すべて" | ProjectStatus>("すべて");

  const loadProjects = async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const mappedProjects = (data ?? []).map((project) => {
        const progress = Number(project.progress ?? 0);
        const dueDate = project.due_date ?? null;
        const status = normalizeStatus(project.status, progress, dueDate);

        return {
          id: String(project.id),
          projectName: project.project_name ?? "未設定の案件",
          siteName: project.site_name ?? "未設定の現場",
          manager: project.manager ?? "未設定",
          startDate: formatDateForDisplay(project.start_date),
          dueDate: formatDateForDisplay(project.due_date),
          progress,
          status,
        };
      });

      setProjects(mappedProjects);

      if (selectedProjectId) {
        const selectedProject = mappedProjects.find((project) => project.id === selectedProjectId) ?? null;
        if (selectedProject) {
          setDetailFormData({
            projectName: selectedProject.projectName,
            siteName: selectedProject.siteName,
            manager: selectedProject.manager,
            startDate: formatDateForInput(selectedProject.startDate),
            dueDate: formatDateForInput(selectedProject.dueDate),
            progress: selectedProject.progress,
            status: selectedProject.status,
          });
        }
      }
    } catch (error) {
      console.error("Supabase project fetch error:", error);
      setErrorMessage(
        error instanceof Error
          ? `データの取得に失敗しました: ${error.message}`
          : "データの取得中に不明なエラーが発生しました。"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: name === "progress" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedProjectName = formData.projectName.trim();
    const trimmedSiteName = formData.siteName.trim();
    const trimmedManager = formData.manager.trim();

    if (!trimmedProjectName || !trimmedSiteName || !trimmedManager || !formData.startDate || !formData.dueDate) {
      setErrorMessage("必須項目をすべて入力してください。");
      setIsSubmitting(false);
      return;
    }

    const finalStatus = resolveAutoStatus(formData.progress, formData.dueDate);

    try {
      const supabase = createClient();
      const { error } = await supabase.from("projects").insert([
        {
          project_name: trimmedProjectName,
          site_name: trimmedSiteName,
          manager: trimmedManager,
          start_date: formData.startDate,
          due_date: formData.dueDate,
          progress: Number(formData.progress),
          status: finalStatus,
        },
      ]);

      if (error) {
        throw error;
      }

      setSuccessMessage("新規案件を登録しました。案件一覧を更新しました。");
      setFormData(emptyForm);
      setIsFormOpen(false);
      await loadProjects();
    } catch (error) {
      console.error("Supabase insert error:", error);
      setErrorMessage(
        error instanceof Error
          ? `登録に失敗しました: ${error.message}`
          : "登録中に不明なエラーが発生しました。"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDetailInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;

    setDetailFormData((previous) => {
      if (!previous) {
        return previous;
      }

      const nextData = {
        ...previous,
        [name]: name === "progress" ? Number(value) : value,
      } as ProjectFormState;

      if (name === "progress" || name === "dueDate") {
        nextData.status = resolveAutoStatus(nextData.progress, nextData.dueDate);
      }

      if (name === "status") {
        nextData.status = value as ProjectStatus;
      }

      return nextData;
    });
  };

  const handleUpdateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedProjectId || !detailFormData) {
      setErrorMessage("更新対象の案件が選択されていません。");
      return;
    }

    const trimmedProjectName = detailFormData.projectName.trim();
    const trimmedSiteName = detailFormData.siteName.trim();
    const trimmedManager = detailFormData.manager.trim();

    if (!trimmedProjectName || !trimmedSiteName || !trimmedManager || !detailFormData.startDate || !detailFormData.dueDate) {
      setErrorMessage("必須項目をすべて入力してください。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const supabase = createClient();
      const finalStatus = resolveAutoStatus(detailFormData.progress, detailFormData.dueDate);
      const { error } = await supabase.from("projects").update({
        project_name: trimmedProjectName,
        site_name: trimmedSiteName,
        manager: trimmedManager,
        start_date: detailFormData.startDate,
        due_date: detailFormData.dueDate,
        progress: Number(detailFormData.progress),
        status: finalStatus,
      }).eq("id", selectedProjectId);

      if (error) {
        throw error;
      }

      setSuccessMessage("案件情報を更新しました。一覧を最新状態に反映しました。");
      await loadProjects();
    } catch (error) {
      console.error("Supabase update error:", error);
      setErrorMessage(
        error instanceof Error
          ? `更新に失敗しました: ${error.message}`
          : "更新中に不明なエラーが発生しました。"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!projectToDelete) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectToDelete.id);

      if (error) {
        throw error;
      }

      if (selectedProjectId === projectToDelete.id) {
        setSelectedProjectId(null);
        setDetailFormData(null);
      }
      setProjectToDelete(null);
      setSuccessMessage("案件を削除しました。案件一覧と集計を更新しました。");
      await loadProjects();
    } catch (error) {
      console.error("Supabase delete error:", error);
      setErrorMessage(
        error instanceof Error
          ? `削除に失敗しました: ${error.message}`
          : "削除中に不明なエラーが発生しました。"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const summary = {
    inProgress: projects.filter((project) => project.status === "進行中").length,
    completed: projects.filter((project) => project.status === "完了").length,
    delayed: projects.filter((project) => project.status === "遅延").length,
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      !normalizedSearchQuery ||
      [project.projectName, project.siteName, project.manager].some((value) =>
        value.toLowerCase().includes(normalizedSearchQuery)
      );
    const matchesStatus = statusFilter === "すべて" || project.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const openProjectDetail = (project: Project) => {
    setSelectedProjectId(project.id);
    setDetailFormData({
      projectName: project.projectName,
      siteName: project.siteName,
      manager: project.manager,
      startDate: formatDateForInput(project.startDate),
      dueDate: formatDateForInput(project.dueDate),
      progress: project.progress,
      status: project.status,
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-800 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <header className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Construction DX</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">工事進捗管理ダッシュボード</h1>
            <p className="mt-1 text-sm text-slate-500">現場の進捗と遅延状況を、毎日の業務判断に。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <button
              type="button"
              onClick={() => setIsFormOpen((current) => !current)}
              className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
            >
              {isFormOpen ? "閉じる" : "新規案件登録"}
            </button>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700">
              <span className="mr-2 text-xs text-slate-500">本日</span>
              2026年9月3日
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div
            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm"
            role="status"
          >
            {successMessage}
          </div>
        ) : null}

        {isFormOpen ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">新規案件登録</h2>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">案件名</span>
                <input
                  type="text"
                  name="projectName"
                  value={formData.projectName}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                  placeholder="例：新宿駅前マンション改修工事"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">現場名</span>
                <input
                  type="text"
                  name="siteName"
                  value={formData.siteName}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                  placeholder="例：新宿駅前"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">担当者</span>
                <input
                  type="text"
                  name="manager"
                  value={formData.manager}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                  placeholder="例：田中 健一"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">ステータス</span>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                >
                  <option value="進行中">進行中</option>
                  <option value="完了">完了</option>
                  <option value="遅延">遅延</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">開始日</span>
                <input
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">完了予定日</span>
                <input
                  type="date"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">進捗率</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  name="progress"
                  value={formData.progress}
                  onChange={handleInputChange}
                  className="h-2 w-full cursor-pointer accent-blue-600"
                />
                <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                  <span>0%</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{formData.progress}%</span>
                  <span>100%</span>
                </div>
              </label>

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "登録中..." : "登録"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 border-l-4 border-l-slate-400 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">全案件数</p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-3xl font-bold text-slate-950">{projects.length}</span>
              <span className="text-xs font-semibold text-slate-400">TOTAL</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 border-l-4 border-l-blue-500 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">進行中</p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-3xl font-bold text-slate-950">{summary.inProgress}</span>
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">進行中</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 border-l-4 border-l-emerald-500 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">完了</p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-3xl font-bold text-slate-950">{summary.completed}</span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">完了</span>
            </div>
          </div>

          <div className="rounded-2xl border border-red-200 border-l-4 border-l-red-500 bg-red-50/70 p-5 shadow-sm">
            <p className="text-sm font-medium text-red-700">遅延</p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-3xl font-bold text-red-800">{summary.delayed}</span>
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">要確認</span>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-4 sm:px-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">工事案件一覧</h2>
              <p className="mt-1 text-xs text-slate-500">案件を選択すると詳細を確認・編集できます</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {filteredProjects.length} / {projects.length}件表示
            </span>
          </div>

          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:p-5 md:flex-row md:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-semibold text-slate-600">案件を検索</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="案件名・現場名・担当者で検索"
                aria-label="案件名・現場名・担当者で検索"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="w-full md:w-48">
              <span className="mb-1 block text-xs font-semibold text-slate-600">ステータスで絞り込み</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "すべて" | ProjectStatus)}
                aria-label="ステータスで絞り込み"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="すべて">すべて</option>
                <option value="進行中">進行中</option>
                <option value="完了">完了</option>
                <option value="遅延">遅延</option>
              </select>
            </label>
          </div>

          {isLoading ? (
            <div className="px-6 py-10 text-center text-slate-500">データを読み込んでいます...</div>
          ) : projects.length === 0 ? (
            <div className="px-6 py-10 text-center text-slate-500">表示する工事案件データがありません。</div>
          ) : filteredProjects.length === 0 ? (
            <div className="px-6 py-10 text-center text-slate-500">該当する工事案件がありません</div>
          ) : (
            <>
              <div className="hidden md:block">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="whitespace-nowrap px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">工事名</th>
                        <th className="whitespace-nowrap px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">現場名</th>
                        <th className="whitespace-nowrap px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">担当者</th>
                        <th className="whitespace-nowrap px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">開始日</th>
                        <th className="whitespace-nowrap px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">完了予定日</th>
                        <th className="whitespace-nowrap px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">進捗率</th>
                        <th className="whitespace-nowrap px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">ステータス</th>
                        <th className="whitespace-nowrap px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredProjects.map((project) => (
                        <tr
                          key={`${project.id}-${project.projectName}`}
                          onClick={() => openProjectDetail(project)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openProjectDetail(project);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          className={
                            project.status === "遅延"
                              ? "cursor-pointer border-l-4 border-l-red-400 bg-red-50/70"
                              : project.status === "完了"
                                ? "cursor-pointer bg-emerald-50/40"
                                : "cursor-pointer bg-white hover:bg-blue-50/50"
                          }
                        >
                          <td className="whitespace-nowrap px-6 py-4 align-middle">
                            <div className="font-semibold text-slate-900">{project.projectName}</div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-slate-600">{project.siteName}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-slate-600">{project.manager}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-slate-600">{project.startDate}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-slate-600">{project.dueDate}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-2.5 w-28 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className={`h-full rounded-full ${progressStyles[project.status]}`}
                                  style={{ width: `${Math.min(Math.max(project.progress, 0), 100)}%` }}
                                />
                              </div>
                              <span className="min-w-10 text-sm font-semibold text-slate-700">{project.progress}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[project.status]}`}>
                              {project.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openProjectDetail(project);
                                }}
                                className="whitespace-nowrap rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                              >
                                編集
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setProjectToDelete(project);
                                }}
                                className="whitespace-nowrap rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                              >
                                削除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="block space-y-3 p-3 md:hidden">
                {filteredProjects.map((project) => (
                  <article
                    key={`mobile-${project.id}-${project.projectName}`}
                    onClick={() => openProjectDetail(project)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openProjectDetail(project);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    className={[
                      "w-full rounded-2xl border border-slate-200 p-4 text-left shadow-sm transition hover:bg-slate-50",
                      project.status === "遅延"
                        ? "bg-red-50/60"
                        : project.status === "完了"
                          ? "bg-emerald-50/60"
                          : "bg-blue-50/60",
                    ].join(" ")}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold text-slate-900">{project.projectName}</p>
                        <p className="mt-1 text-sm text-slate-600">{project.siteName}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[project.status]}`}>
                          {project.status}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openProjectDetail(project);
                          }}
                          className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setProjectToDelete(project);
                          }}
                          className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                        >
                          削除
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-slate-700">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">担当者</span>
                        <span className="font-medium text-slate-700">{project.manager}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">開始日</span>
                        <span className="font-medium text-slate-700">{project.startDate}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">完了予定日</span>
                        <span className="font-medium text-slate-700">{project.dueDate}</span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>進捗率</span>
                        <span>{project.progress}%</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${progressStyles[project.status]}`}
                          style={{ width: `${Math.min(Math.max(project.progress, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        {selectedProjectId && detailFormData ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">案件詳細・編集</h2>
              <button
                type="button"
                onClick={() => {
                  setSelectedProjectId(null);
                  setDetailFormData(null);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                  キャンセル
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">案件名</span>
                <input
                  type="text"
                  name="projectName"
                  value={detailFormData.projectName}
                  onChange={handleDetailInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">現場名</span>
                <input
                  type="text"
                  name="siteName"
                  value={detailFormData.siteName}
                  onChange={handleDetailInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">担当者</span>
                <input
                  type="text"
                  name="manager"
                  value={detailFormData.manager}
                  onChange={handleDetailInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">ステータス</span>
                <select
                  name="status"
                  value={detailFormData.status}
                  onChange={handleDetailInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                >
                  <option value="進行中">進行中</option>
                  <option value="完了">完了</option>
                  <option value="遅延">遅延</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">開始日</span>
                <input
                  type="date"
                  name="startDate"
                  value={detailFormData.startDate}
                  onChange={handleDetailInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">完了予定日</span>
                <input
                  type="date"
                  name="dueDate"
                  value={detailFormData.dueDate}
                  onChange={handleDetailInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">進捗率</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  name="progress"
                  value={detailFormData.progress}
                  onChange={handleDetailInputChange}
                  className="h-2 w-full cursor-pointer accent-blue-600"
                />
                <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                  <span>0%</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{detailFormData.progress}%</span>
                  <span>100%</span>
                </div>
              </label>

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {projectToDelete ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            role="presentation"
            onClick={() => {
              if (!isSubmitting) {
                setProjectToDelete(null);
              }
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-dialog-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="delete-dialog-title" className="text-xl font-bold text-slate-900">
                案件を削除しますか？
              </h2>
              <p className="mt-3 break-words text-sm leading-6 text-slate-600">
                「{projectToDelete.projectName}」を削除します。この操作は取り消せません。
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setProjectToDelete(null)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleDelete()}
                  className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "削除中..." : "削除する"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
