import type { Priority, ProjectDetail, WorkItemStatus, WorkItemType } from "@xm/shared";
import {
  filterItemCards,
  filterOptions,
  priorityLabels,
  priorityOptions,
  statusLabels,
  statusOptions,
  toItemCard,
  typeLabels,
  typeOptions,
  type FilterValue,
  type ItemCard
} from "../../domain/projectView";
import { ensureSignedIn } from "../../core/session";
import { xmApi } from "../../services/xmApi";

type ProjectDetailData = {
  projectId: string;
  project: ProjectDetail | null;
  items: ItemCard[];
  visibleItems: ItemCard[];
  filters: Array<{ value: FilterValue; label: string; active: boolean }>;
  filterLabels: string[];
  filterIndex: number;
  typeLabels: string[];
  statusLabels: string[];
  priorityLabels: string[];
  newTitle: string;
  newDescription: string;
  newTypeIndex: number;
  newStatusIndex: number;
  newPriorityIndex: number;
  loading: boolean;
  saving: boolean;
  error: string;
};

Page<ProjectDetailData, {
  loadProject(): Promise<void>;
  onFilterTap(event: { currentTarget: { dataset: { value?: FilterValue } } }): void;
  onTitleInput(event: { detail: { value: string } }): void;
  onDescriptionInput(event: { detail: { value: string } }): void;
  onTypeChange(event: { detail: { value: string } }): void;
  onStatusChange(event: { detail: { value: string } }): void;
  onPriorityChange(event: { detail: { value: string } }): void;
  createItem(): Promise<void>;
  openItem(event: { currentTarget: { dataset: { id?: string } } }): void;
}>({
  data: {
    projectId: "",
    project: null,
    items: [],
    visibleItems: [],
    filters: filterOptions.map((filter, index) => ({ ...filter, active: index === 0 })),
    filterLabels: filterOptions.map((filter) => filter.label),
    filterIndex: 0,
    typeLabels: typeOptions.map((type) => typeLabels[type]),
    statusLabels: statusOptions.map((status) => statusLabels[status]),
    priorityLabels: priorityOptions.map((priority) => priorityLabels[priority]),
    newTitle: "",
    newDescription: "",
    newTypeIndex: 0,
    newStatusIndex: 0,
    newPriorityIndex: 1,
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
      const filter = filterOptions[this.data.filterIndex]?.value ?? "ALL";
      this.setData({
        project,
        items: rows,
        visibleItems: filterItemCards(rows, filter),
        loading: false
      });
    } catch (caught) {
      this.setData({
        error: caught instanceof Error ? caught.message : "项目加载失败",
        loading: false
      });
    }
  },

  onFilterTap(event) {
    const value = event.currentTarget.dataset.value ?? "ALL";
    const filterIndex = Math.max(0, filterOptions.findIndex((filter) => filter.value === value));
    this.setData({
      filterIndex,
      filters: filterOptions.map((filter, index) => ({ ...filter, active: index === filterIndex })),
      visibleItems: filterItemCards(this.data.items, value)
    });
  },

  onTitleInput(event) {
    this.setData({ newTitle: event.detail.value });
  },

  onDescriptionInput(event) {
    this.setData({ newDescription: event.detail.value });
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
        notes: "",
        tagNames: [],
        checklist: []
      });
      this.setData({
        newTitle: "",
        newDescription: "",
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
