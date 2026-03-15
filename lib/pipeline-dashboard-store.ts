import type { PipelineDashboardData } from "@/components/pipeline-quality-dashboard";

type Listener = () => void;

let _dashboardData: PipelineDashboardData | null = null;
const _listeners = new Set<Listener>();

function notify() {
  for (const fn of _listeners) {
    fn();
  }
}

export function setPipelineDashboardData(data: PipelineDashboardData | null) {
  _dashboardData = data;
  notify();
}

export function getPipelineDashboardData(): PipelineDashboardData | null {
  return _dashboardData;
}

export function subscribePipelineDashboard(listener: Listener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}
