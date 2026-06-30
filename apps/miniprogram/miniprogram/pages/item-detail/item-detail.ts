import type { ChecklistItem, Priority, WorkItem, WorkItemStatus, WorkItemType } from "@xm/shared";
import {
  checklistDoneText,
  parseTagNames,
  priorityLabels,
  priorityOptions,
  statusLabels,
  statusOptions,
  typeLabels,
  typeOptions
} from "../../domain/projectView";
import { ensureSignedIn } from "../../core/session";
import { xmApi } from "../../services/xmApi";

type ItemDetailData = {
  itemId: string;
  item: WorkItem | null;
  checklist: ChecklistItem[];
  title: string;
  description: string;
  notes: string;
  tagNamesText: string;
  typeIndex: number;
  statusIndex: number;
  priorityIndex: number;
  typeLabels: string[];
  statusLabels: string[];
  priorityLabels: string[];
  checklistSummary: string;
  newChecklistTitle: string;
  loading: boolean;
  saving: boolean;
  error: string;
};

function indexOfValue<T extends string>(values: T[], value: T): number {
  return Math.max(0, values.indexOf(value));
}

function tagsToText(item: WorkItem): string {
  return item.tags.map((tag) => tag.name).join("，");
}

Page<ItemDetailData, {
  loadItem(): Promise<void>;
  fillForm(item: WorkItem): void;
  onTitleInput(event: { detail: { value: string } }): void;
  onDescriptionInput(event: { detail: { value: string } }): void;
  onNotesInput(event: { detail: { value: string } }): void;
  onTagsInput(event: { detail: { value: string } }): void;
  onTypeChange(event: { detail: { value: string } }): void;
  onStatusChange(event: { detail: { value: string } }): void;
  onPriorityChange(event: { detail: { value: string } }): void;
  saveItem(): Promise<void>;
  toggleChecklist(event: { currentTarget: { dataset: { id?: string } } }): Promise<void>;
  onChecklistTitleInput(event: { detail: { value: string } }): void;
  addChecklist(): Promise<void>;
}>({
  data: {
    itemId: "",
    item: null,
    checklist: [],
    title: "",
    description: "",
    notes: "",
    tagNamesText: "",
    typeIndex: 0,
    statusIndex: 0,
    priorityIndex: 1,
    typeLabels: typeOptions.map((type) => typeLabels[type]),
    statusLabels: statusOptions.map((status) => statusLabels[status]),
    priorityLabels: priorityOptions.map((priority) => priorityLabels[priority]),
    checklistSummary: "0/0",
    newChecklistTitle: "",
    loading: false,
    saving: false,
    error: ""
  },

  onLoad(query) {
    const itemId = query?.id ?? "";
    this.setData({ itemId });
    if (itemId && ensureSignedIn()) {
      void this.loadItem();
    }
  },

  async loadItem() {
    if (!this.data.itemId) {
      this.setData({ error: "任务 ID 缺失" });
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      const item = await xmApi.getItem(this.data.itemId);
      this.fillForm(item);
      this.setData({ loading: false });
    } catch (caught) {
      this.setData({
        error: caught instanceof Error ? caught.message : "任务加载失败",
        loading: false
      });
    }
  },

  fillForm(item) {
    this.setData({
      item,
      checklist: item.checklist,
      checklistSummary: checklistDoneText(item.checklist),
      title: item.title,
      description: item.description,
      notes: item.notes,
      tagNamesText: tagsToText(item),
      typeIndex: indexOfValue(typeOptions, item.type),
      statusIndex: indexOfValue(statusOptions, item.status),
      priorityIndex: indexOfValue(priorityOptions, item.priority)
    });
  },

  onTitleInput(event) {
    this.setData({ title: event.detail.value });
  },

  onDescriptionInput(event) {
    this.setData({ description: event.detail.value });
  },

  onNotesInput(event) {
    this.setData({ notes: event.detail.value });
  },

  onTagsInput(event) {
    this.setData({ tagNamesText: event.detail.value });
  },

  onTypeChange(event) {
    this.setData({ typeIndex: Number(event.detail.value) });
  },

  onStatusChange(event) {
    this.setData({ statusIndex: Number(event.detail.value) });
  },

  onPriorityChange(event) {
    this.setData({ priorityIndex: Number(event.detail.value) });
  },

  async saveItem() {
    const title = this.data.title.trim();
    if (!title) {
      this.setData({ error: "请输入任务标题" });
      return;
    }

    this.setData({ saving: true, error: "" });
    try {
      const item = await xmApi.updateItem(this.data.itemId, {
        title,
        description: this.data.description.trim(),
        notes: this.data.notes.trim(),
        type: (typeOptions[this.data.typeIndex] ?? "FEATURE") as WorkItemType,
        status: (statusOptions[this.data.statusIndex] ?? "PENDING") as WorkItemStatus,
        priority: (priorityOptions[this.data.priorityIndex] ?? "MEDIUM") as Priority,
        tagNames: parseTagNames(this.data.tagNamesText)
      });
      this.fillForm(item);
      this.setData({ saving: false });
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (caught) {
      this.setData({
        error: caught instanceof Error ? caught.message : "保存失败",
        saving: false
      });
    }
  },

  async toggleChecklist(event) {
    const checkId = event.currentTarget.dataset.id;
    const item = this.data.item;
    if (!checkId || !item) {
      return;
    }

    const check = item.checklist.find((candidate: ChecklistItem) => candidate.id === checkId);
    if (!check) {
      return;
    }

    try {
      const updated = await xmApi.updateChecklist(checkId, { done: !check.done });
      this.fillForm(updated);
    } catch (caught) {
      this.setData({ error: caught instanceof Error ? caught.message : "清单更新失败" });
    }
  },

  onChecklistTitleInput(event) {
    this.setData({ newChecklistTitle: event.detail.value });
  },

  async addChecklist() {
    const title = this.data.newChecklistTitle.trim();
    if (!title) {
      this.setData({ error: "请输入清单内容" });
      return;
    }

    try {
      const item = await xmApi.createChecklist(this.data.itemId, { title });
      this.fillForm(item);
      this.setData({ newChecklistTitle: "" });
      wx.showToast({ title: "已添加", icon: "success" });
    } catch (caught) {
      this.setData({ error: caught instanceof Error ? caught.message : "添加清单失败" });
    }
  }
});
