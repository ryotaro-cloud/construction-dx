import { createClient } from "@/lib/supabase";
import ProjectDetailClient from "./project-detail-client";

type ProjectStatus = "未着手" | "進行中" | "完了" | "遅延";

type Project = {
  projectName: string;
  siteName: string;
  manager: string;
  startDate: string;
  dueDate: string;
  progress: number;
  status: ProjectStatus;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  if (value.includes("/")) return value;

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
};

const resolveStatus = (status: string | null | undefined, progress: number, dueDate: string | null | undefined): ProjectStatus => {
  if (dueDate) {
    const due = new Date(`${dueDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!Number.isNaN(due.getTime()) && due < today) return "遅延";
  }

  if (progress <= 0) return "未着手";
  if (progress >= 100) return "完了";
  return "進行中";
};

async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await createClient()
    .from("projects")
    .select("project_name, site_name, manager, start_date, due_date, progress, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const progress = Number(data.progress ?? 0);
  return {
    projectName: data.project_name ?? "未設定の案件",
    siteName: data.site_name ?? "未設定の現場",
    manager: data.manager ?? "未設定",
    startDate: formatDate(data.start_date),
    dueDate: formatDate(data.due_date),
    progress,
    status: resolveStatus(data.status, progress, data.due_date),
  };
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-slate-800">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-blue-700">Construction DX</p>
          <h1 className="mt-3 text-2xl font-bold text-slate-950">案件が見つかりませんでした</h1>
          <p className="mt-3 text-sm text-slate-500">指定された案件IDを確認してください。</p>
          <a href="/" className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">一覧へ戻る</a>
        </section>
      </main>
    );
  }

  return <ProjectDetailClient project={project} projectId={id} />;
}
