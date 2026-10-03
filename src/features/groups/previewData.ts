import type { ClipboardEntry } from "../../shared/types";

export const createPreviewHistory = (now = Date.now()): ClipboardEntry[] => {
  const base = {
    source_app_path: undefined,
    use_count: 1,
    is_external: false,
    file_preview_exists: true,
    pinned_order: 0,
    is_pinned: false
  };

  return [
    {
      ...base,
      id: 1,
      content_type: "text",
      content: "周会纪要：下周三前给出版本说明",
      preview: "周会纪要：下周三前给出版本说明",
      source_app: "记事本",
      timestamp: now - 1000,
      is_pinned: true,
      pinned_order: 2,
      tags: ["工作"]
    },
    {
      ...base,
      id: 2,
      content_type: "text",
      content: "服务器地址 10.0.0.8",
      preview: "服务器地址 10.0.0.8",
      source_app: "终端",
      timestamp: now - 2000,
      tags: ["工作"]
    },
    {
      ...base,
      id: 3,
      content_type: "url",
      content: "https://example.com/notes",
      preview: "https://example.com/notes",
      source_app: "浏览器",
      timestamp: now - 3000,
      tags: ["工作"]
    },
    {
      ...base,
      id: 4,
      content_type: "text",
      content: "报销单号 BX-2048",
      preview: "报销单号 BX-2048",
      source_app: "邮件",
      timestamp: now - 4000,
      is_pinned: true,
      pinned_order: 1,
      tags: ["财务"]
    },
    {
      ...base,
      id: 5,
      content_type: "text",
      content: "客户联系人 王敏",
      preview: "客户联系人 王敏",
      source_app: "微信",
      timestamp: now - 5000,
      tags: ["财务"]
    },
    {
      ...base,
      id: 6,
      content_type: "text",
      content: "临时复制的一段说明",
      preview: "临时复制的一段说明",
      source_app: "Word",
      timestamp: now - 600,
      tags: []
    }
  ];
};
