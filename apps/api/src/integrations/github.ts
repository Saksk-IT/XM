import type { GitHubCommit, GitHubCommitListQuery } from "@xm/shared";
import type { PrismaClient } from "@prisma/client";
import { getIntegrationConfig } from "../settings.js";

type GitHubRepo = {
  owner: string;
  repo: string;
};

type CacheEntry = {
  expiresAt: number;
  commits: GitHubCommit[];
};

type GitHubCommitResponse = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: {
      name?: string;
      email?: string;
      date?: string;
    } | null;
    verification?: {
      verified?: boolean;
      reason?: string | null;
    } | null;
  };
  author?: {
    login?: string;
  } | null;
};

const cache = new Map<string, CacheEntry>();
const cacheTtlMs = 60_000;

export class GitHubIntegrationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

export function clearGitHubCommitCache(): void {
  cache.clear();
}

export function parseGitHubRepoUrl(repoUrl: string | null | undefined): GitHubRepo {
  const value = repoUrl?.trim();
  if (!value) {
    throw new GitHubIntegrationError("项目未配置 GitHub 仓库链接", 400);
  }

  const sshMatch = /^git@github\.com:([^/\s]+)\/(.+?)(?:\.git)?$/i.exec(value);
  if (sshMatch) {
    const [, owner, repo] = sshMatch;
    if (!owner || !repo) {
      throw new GitHubIntegrationError("GitHub 仓库链接格式无效", 400);
    }

    return {
      owner,
      repo
    };
  }

  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "github.com") {
      throw new GitHubIntegrationError("仅支持 github.com 仓库链接", 400);
    }

    const [owner, repo] = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.git$/i, "")
      .split("/");
    if (!owner || !repo) {
      throw new GitHubIntegrationError("GitHub 仓库链接格式无效", 400);
    }

    return { owner, repo };
  } catch (caught) {
    if (caught instanceof GitHubIntegrationError) {
      throw caught;
    }
    throw new GitHubIntegrationError("GitHub 仓库链接格式无效", 400);
  }
}

export async function listGitHubCommits(
  db: PrismaClient,
  repoUrl: string | null | undefined,
  query: GitHubCommitListQuery
): Promise<GitHubCommit[]> {
  const config = await getIntegrationConfig(db);
  const repo = parseGitHubRepoUrl(repoUrl);
  const cacheKey = JSON.stringify({ repo, query });
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.commits;
  }

  const url = new URL(`https://api.github.com/repos/${repo.owner}/${repo.repo}/commits`);
  url.searchParams.set("per_page", String(query.limit));
  if (query.branch) {
    url.searchParams.set("sha", query.branch);
  }
  if (query.since) {
    url.searchParams.set("since", query.since);
  }

  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "XM-project-manager"
  });
  if (config.githubToken) {
    headers.set("Authorization", `Bearer ${config.githubToken}`);
  }

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch {
    throw new GitHubIntegrationError("无法连接 GitHub，请稍后重试", 502);
  }

  if (!response.ok) {
    throw await createGitHubError(response);
  }

  const body = (await response.json()) as GitHubCommitResponse[];
  const commits = body.map(serializeCommit);
  cache.set(cacheKey, {
    expiresAt: Date.now() + cacheTtlMs,
    commits
  });
  return commits;
}

async function createGitHubError(response: Response): Promise<GitHubIntegrationError> {
  const message = await readErrorMessage(response);
  if (response.status === 404) {
    return new GitHubIntegrationError("GitHub 仓库不存在，或当前 token 无权限读取", 404);
  }
  if (response.status === 401) {
    return new GitHubIntegrationError("GitHub token 无效，请检查服务端配置", 502);
  }
  if (response.status === 403) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0" || message.toLowerCase().includes("rate limit")) {
      return new GitHubIntegrationError("GitHub API 调用已达到限额，请稍后重试或配置 token", 429);
    }
    return new GitHubIntegrationError("GitHub 拒绝访问该仓库，请检查 token 权限", 403);
  }
  return new GitHubIntegrationError(message || "读取 GitHub 提交记录失败", 502);
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? "";
  } catch {
    return "";
  }
}

function serializeCommit(commit: GitHubCommitResponse): GitHubCommit {
  const message = commit.commit.message ?? "";
  const title = message.split("\n")[0]?.trim() || commit.sha.slice(0, 7);
  const author = commit.commit.author;
  const authoredAt = author?.date ? new Date(author.date).toISOString() : new Date(0).toISOString();

  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    title,
    message,
    authorName: commit.author?.login ?? author?.name ?? "未知作者",
    authorEmail: author?.email ?? null,
    authoredAt,
    url: commit.html_url,
    verification: {
      verified: commit.commit.verification?.verified ?? false,
      reason: commit.commit.verification?.reason ?? null
    }
  };
}
