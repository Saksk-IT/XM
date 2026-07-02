import type { GeneratedWorkItemDraft, Priority, ProjectDetail, ProjectSection, WorkItemStatus, WorkItemType } from "@xm/shared";
import {
  createProjectSectionFilters,
  defaultProjectSection,
  filterItemCards,
  parseTagNames,
  priorityLabels,
  priorityOptions,
  resolveProjectSection,
  sectionLabels,
  statusLabels,
  statusOptions,
  toItemCard,
  typeLabels,
  typeOptions,
  type ItemCard,
  type SectionOption
} from "../../domain/projectView";
import { ensureSignedIn } from "../../core/session";
import { xmApi } from "../../services/xmApi";

type ProjectDetailData = {
  projectId: string;
  project: ProjectDetail | null;
  items: ItemCard[];
  visibleItems: ItemCard[];
  sections: SectionOption[];
  activeSection: ProjectSection;
  activeSectionLabel: string;
  activeSectionCount: number;
  showOverview: boolean;
  typeLabels: string[];
  statusLabels: string[];
  priorityLabels: string[];
  newTitle: string;
  newDescription: string;
  newTypeIndex: number;
  newStatusIndex: number;
  newPriorityIndex: number;
  newRawInput: string;
  newTags: string;
  newChecklist: string;
  newNotes: string;
  drafting: boolean;
  draftError: string;
  loading: boolean;
  saving: boolean;
  error: string;
};

function indexOfValue<T extends string>(values: T[], value: T): number {
  return Math.max(0, values.indexOf(value));
}

function splitChecklist(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function checklistToText(checklist: string[]): string {
  return checklist.join("\n");
}

Page<ProjectDetailData, {
  loadProject(): Promise<void>;
  onSectionTap(event: { currentTarget: { dataset: { value?: string } } }): void;
  onRawInput(event: { detail: { value: string } }): void;
  onTitleInput(event: { detail: { value: string } }): void;
  onDescriptionInput(event: { detail: { value: string } }): void;
  onTagsInput(event: { detail: { value: string } }): void;
  onChecklistInput(event: { detail: { value: string } }): void;
  onTypeChange(event: { detail: { value: string } }): void;
  onStatusChange(event: { detail: { value: string } }): void;
  onPriorityChange(event: { detail: { value: string } }): void;
  generateDraft(): Promise<void>;
  applyDraft(draft: GeneratedWorkItemDraft): void;
  createItem(): Promise<void>;
  openItem(event: { currentTarget: { dataset: { id?: string } } }): void;
}>({
  data: {
    projectId: "",
    project: null,
    items: [],
    visibleItems: [],
    sections: createProjectSectionFilters(null, defaultProjectSection),
    activeSection: defaultProjectSection,
    activeSectionLabel: sectionLabels[defaultProjectSection],
    activeSectionCount: 0,
    showOverview: true,
    typeLabels: typeOptions.map((type) => typeLabels[type]),
    statusLabels: statusOptions.map((status) => statusLabels[status]),
    priorityLabels: priorityOptions.map((priority) => priorityLabels[priority]),
    newTitle: "",
    newDescription: "",
    newTypeIndex: 0,
    newStatusIndex: 0,
    newPriorityIndex: 1,
    newRawInput: "",
    newTags: "",
    newChecklist: "",
    newNotes: "",
    drafting: false,
    draftError: "",
    loading: false,
    saving: false,
    error: ""
  },

  onLoad(query) {
    const projectId = query?.id ?? "";
    this.setData({ projectId });
    if (projectId && ensureSignedIn()) {
      void this.loadProject();
    }
  },

  async onPullDownRefresh() {
    await this.loadProject();
    wx.stopPullDownRefresh();
  },

  async loadProject() {
    if (!this.data.projectId) {
      this.setData({ error: "项目 ID 缺失" });
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      const project = await xmApi.getProject(this.data.projectId);
      const rows = project.workItems.map(toItemCard);
      const activeSection = this.data.activeSection;
      const sections = createProjectSectionFilters(project, activeSection);
      const activeSectionCount = sections.find((section) => section.value === activeSection)?.count ?? 0;
      this.setData({
        project,
        items: rows,
        visibleItems: filterItemCards(rows, activeSection),
        sections,
        activeSectionLabel: sectionLabels[activeSection],
        activeSectionCount,
        showOverview: activeSection === "OVERVIEW",
        loading: false
      });
    } catch (caught) {
      this.setData({
        error: caught instanceof Error ? caught.message : "项目加载失败",
        loading: false
      });
    }
  },

  onSectionTap(event) {
    const activeSection = resolveProjectSection(event.currentTarget.dataset.value);
    const sections = createProjectSectionFilters(this.data.project, activeSection);
    const activeSectionCount = sections.find((section) => section.value === activeSection)?.count ?? 0;
    this.setData({
      activeSection,
      activeSectionLabel: sectionLabels[activeSection],
      activeSectionCount,
      showOverview: activeSection === "OVERVIEW",
      sections,
      visibleItems: filterItemCards(this.data.items, activeSection)
    });
  },

  onRawInput(event) {
    this.setData({ newRawInput: event.detail.value });
  },

  onTitleInput(event) {
    this.setData({ newTitle: event.detail.value });
  },

  onDescriptionInput(event) {
    this.setData({ newDescription: event.detail.value });
  },

  onTagsInput(event) {
    this.setData({ newTags: event.detail.value });
  },

  onChecklistInput(event) {
    this.setData({ newChecklist: event.detail.value });
  },

  onTypeChange(event) {
    this.setData({ newTypeIndex: Number(event.detail.value) });
  },

  onStatusChange(event) {
    this.setData({ newStatusIndex: Number(event.detail.value) });
  },

  onPriorityChange(event) {
    this.setData({ newPriorityIndex: Number(event.detail.value) });
  },

  async generateDraft() {
    const input = this.data.newRawInput.trim();
    if (!this.data.projectId) {
      this.setData({ draftError: "项目 ID 缺失" });
      return;
    }
    if (input.length < 10) {
      this.setData({ draftError: "请先粘贴至少 10 个字的原始描述" });
      return;
    }

    this.setData({ drafting: true, draftError: "", error: "" });
    try {
      const draft = await xmApi.generateWorkItemDraft(this.data.projectId, { input });
      this.applyDraft(draft);
      wx.showToast({ title: "已生成草稿", icon: "success" });
    } catch (caught) {
      this.setData({
        draftError: caught instanceof Error ? caught.message : "整理草稿失败",
        drafting: false
      });
    }
  },

  applyDraft(draft) {
    this.setData({
      newTitle: draft.title,
      newDescription: draft.description,
      newTypeIndex: indexOfValue(typeOptions, draft.type),
      newStatusIndex: indexOfValue(statusOptions, draft.status),
      newPriorityIndex: indexOfValue(priorityOptions, draft.priority),
      newTags: draft.tagNames.join("，"),
      newChecklist: checklistToText(draft.checklist),
      newNotes: draft.notes,
      drafting: false,
      draftError: ""
    });
  },

  async createItem() {
    const title = this.data.newTitle.trim();
    if (!title) {
      this.setData({ error: "请输入任务标题" });
      return;
    }

    this.setData({ saving: true, error: "" });
    try {
      await xmApi.createItem(this.data.projectId, {
        title,
        description: this.data.newDescription.trim(),
        type: (typeOptions[this.data.newTypeIndex] ?? "FEATURE") as WorkItemType,
        status: (statusOptions[this.data.newStatusIndex] ?? "PENDING") as WorkItemStatus,
        priority: (priorityOptions[this.data.newPriorityIndex] ?? "MEDIUM") as Priority,
        notes: this.data.newNotes.trim(),
        tagNames: parseTagNames(this.data.newTags),
        checklist: splitChecklist(this.data.newChecklist)
      });
      this.setData({
        newRawInput: "",
        newTitle: "",
        newDescription: "",
        newTags: "",
        newChecklist: "",
        newNotes: "",
        draftError: "",
        saving: false
      });
      await this.loadProject();
      wx.showToast({ title: "已创建", icon: "success" });
    } catch (caught) {
      this.setData({
        error: caught instanceof Error ? caught.message : "创建任务失败",
        saving: false
      });
    }
  },

  openItem(event) {
    const id = event.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: `/pages/item-detail/item-detail?id=${id}` });
    }
  }
});
