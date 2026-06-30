import { createProjectOverview, toProjectCard, type ProjectCard, type ProjectOverview } from "../../domain/projectView";
import { ensureSignedIn } from "../../core/session";
import { xmApi } from "../../services/xmApi";

type ProjectsData = {
  loading: boolean;
  error: string;
  overview: ProjectOverview;
  projects: ProjectCard[];
};

Page<ProjectsData, {
  loadProjects(): Promise<void>;
  openProject(event: { currentTarget: { dataset: { id?: string } } }): void;
}>({
  data: {
    loading: false,
    error: "",
    overview: {
      totalProjects: 0,
      openItems: 0,
      doneItems: 0,
      averageCompletion: 0
    },
    projects: []
  },

  onShow() {
    if (!ensureSignedIn()) {
      return;
    }
    void this.loadProjects();
  },

  async onPullDownRefresh() {
    await this.loadProjects();
    wx.stopPullDownRefresh();
  },

  async loadProjects() {
    this.setData({ loading: true, error: "" });
    try {
      const projects = await xmApi.listProjects();
      this.setData({
        overview: createProjectOverview(projects),
        projects: projects.map(toProjectCard),
        loading: false
      });
    } catch (caught) {
      this.setData({
        error: caught instanceof Error ? caught.message : "项目加载失败",
        loading: false
      });
    }
  },

  openProject(event) {
    const id = event.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: `/pages/project-detail/project-detail?id=${id}` });
    }
  }
});
