import { generatedWorkItemDraftSchema, type GeneratedWorkItemDraft } from "@xm/shared";
import type { PrismaClient } from "@prisma/client";
import { env } from "../env.js";
import { getIntegrationConfig } from "../settings.js";

type ResponsesContent = {
  type?: string;
  text?: string;
};

type ResponsesOutput = {
  type?: string;
  content?: ResponsesContent[];
};

type ResponsesBody = {
  output_text?: string;
  output?: ResponsesOutput[];
};

export class OpenAIIntegrationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

export async function generateWorkItemDraft(db: PrismaClient, input: string): Promise<GeneratedWorkItemDraft> {
  const config = await getIntegrationConfig(db);
  if (!config.openaiApiKey || !config.openaiModel) {
    throw new OpenAIIntegrationError("OpenAI Responses 未配置，请先设置 OPENAI_API_KEY 和 OPENAI_MODEL", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.openaiTimeoutMs);
  try {
    const response = await fetch(`${config.openaiBaseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.openaiModel,
        instructions: [
          "你是一个项目管理整理器，只输出符合 schema 的 JSON。",
          "把用户输入整理成可编辑的事项草稿，语言使用简体中文。",
          "标题简短直接；描述面向项目成员；标签用模块、页面或技术名；清单写可验收步骤。",
          "如果是缺陷、报错、异常、修复类内容，type 使用 BUG；否则使用 FEATURE。",
          "除非用户明确说已完成，status 使用 PENDING。"
        ].join("\n"),
        input,
        max_output_tokens: 1200,
        text: {
          format: {
            type: "json_schema",
            name: "xm_work_item_draft",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["title", "description", "type", "status", "priority", "notes", "tagNames", "checklist"],
              properties: {
                title: {
                  type: "string",
                  maxLength: 160
                },
                description: {
                  type: "string",
                  maxLength: 2000
                },
                type: {
                  type: "string",
                  enum: ["BUG", "FEATURE"]
                },
                status: {
                  type: "string",
                  enum: ["PENDING", "IN_PROGRESS", "DONE"]
                },
                priority: {
                  type: "string",
                  enum: ["LOW", "MEDIUM", "HIGH"]
                },
                notes: {
                  type: "string",
                  maxLength: 4000
                },
                tagNames: {
                  type: "array",
                  maxItems: 8,
                  items: {
                    type: "string",
                    maxLength: 32
                  }
                },
                checklist: {
                  type: "array",
                  maxItems: 12,
                  items: {
                    type: "string",
                    maxLength: 160
                  }
                }
              }
            }
          }
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw await createOpenAIError(response);
    }

    const body = (await response.json()) as ResponsesBody;
    const text = extractOutputText(body);
    if (!text) {
      throw new OpenAIIntegrationError("OpenAI 未返回可解析的草稿内容", 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new OpenAIIntegrationError("OpenAI 返回的草稿不是合法 JSON", 502);
    }

    const result = generatedWorkItemDraftSchema.safeParse(parsed);
    if (!result.success) {
      throw new OpenAIIntegrationError("OpenAI 返回的草稿字段不完整，请重试", 502);
    }

    return result.data;
  } catch (caught) {
    if (caught instanceof OpenAIIntegrationError) {
      throw caught;
    }
    if (caught instanceof Error && caught.name === "AbortError") {
      throw new OpenAIIntegrationError("OpenAI 请求超时，请稍后重试", 504);
    }
    throw new OpenAIIntegrationError("无法连接 OpenAI Responses，请检查服务端网络和配置", 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function createOpenAIError(response: Response): Promise<OpenAIIntegrationError> {
  const message = await readOpenAIError(response);
  if (response.status === 401) {
    return new OpenAIIntegrationError("OpenAI API Key 无效，请检查服务端配置", 503);
  }
  if (response.status === 429) {
    return new OpenAIIntegrationError("OpenAI 调用达到限额，请稍后重试", 429);
  }
  return new OpenAIIntegrationError(message || "OpenAI Responses 调用失败", 502);
}

async function readOpenAIError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? "";
  } catch {
    return "";
  }
}

function extractOutputText(body: ResponsesBody): string {
  if (typeof body.output_text === "string") {
    return body.output_text;
  }

  for (const output of body.output ?? []) {
    for (const content of output.content ?? []) {
      if ((content.type === "output_text" || content.type === "text") && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}
