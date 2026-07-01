import type {
  CreateChecklistInput,
  CreateWorkItemInput,
  GeneratedWorkItemDraft,
  GenerateWorkItemDraftInput,
  MiniprogramAuthResponse,
  ProjectDetail,
  ProjectSummary,
  UpdateChecklistInput,
  UpdateWorkItemInput,
  WorkItem,
  WorkItemQuery
} from "@xm/shared";
import { apiRequest, createQueryString } from "../core/request";

export const xmApi = {
  miniprogramLogin(code: string) {
    return apiRequest<MiniprogramAuthResponse>("/api/miniprogram/auth/login", {
      method: "POST",
      data: { code }
    });
  },
  miniprogramBind(input: { bindToken: string; username: string; password: string }) {
    return apiRequest<MiniprogramAuthResponse>("/api/miniprogram/auth/bind", {
      method: "POST",
      data: input
    });
  },
  listProjects(options: { includeArchived?: boolean } = {}) {
    return apiRequest<ProjectSummary[]>(`/api/projects${createQueryString({ includeArchived: options.includeArchived })}`);
  },
  getProject(id: string) {
    return apiRequest<ProjectDetail>(`/api/projects/${id}`);
  },
  generateWorkItemDraft(projectId: string, input: GenerateWorkItemDraftInput) {
    return apiRequest<GeneratedWorkItemDraft>(`/api/projects/${projectId}/work-items/draft`, {
      method: "POST",
      data: input
    });
  },
  getItem(id: string) {
    return apiRequest<WorkItem>(`/api/items/${id}`);
  },
  listItems(projectId: string, query: WorkItemQuery = {}) {
    return apiRequest<WorkItem[]>(`/api/projects/${projectId}/items${createQueryString(query)}`);
  },
  createItem(projectId: string, input: CreateWorkItemInput) {
    return apiRequest<WorkItem>(`/api/projects/${projectId}/items`, {
      method: "POST",
      data: input
    });
  },
  updateItem(id: string, input: UpdateWorkItemInput) {
    return apiRequest<WorkItem>(`/api/items/${id}`, {
      method: "PATCH",
      data: input
    });
  },
  createChecklist(id: string, input: CreateChecklistInput) {
    return apiRequest<WorkItem>(`/api/items/${id}/checklist`, {
      method: "POST",
      data: input
    });
  },
  updateChecklist(id: string, input: UpdateChecklistInput) {
    return apiRequest<WorkItem>(`/api/checklist/${id}`, {
      method: "PATCH",
      data: input
    });
  }
};
