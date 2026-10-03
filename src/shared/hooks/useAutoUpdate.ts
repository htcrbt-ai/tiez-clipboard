import { useCallback, useState } from "react";

export type UpdateStatus = "idle" | "checking" | "downloading" | "ready" | "error";

/**
 * Custom build: startup and repeat update checks are disabled so the official
 * updater cannot replace this install. The hook shape stays the same for the
 * existing dialog, which simply never opens.
 */
export const useAutoUpdate = () => {
  const [isOpen] = useState(false);
  const [status] = useState<UpdateStatus>("idle");
  const [version] = useState("");
  const [notes] = useState("");
  const [downloadProgress] = useState(0);

  const checkUpdate = useCallback(async () => {
    return;
  }, []);

  return {
    isOpen,
    status,
    version,
    notes,
    downloadProgress,
    onManualUpdate: checkUpdate,
    onStartDownload: checkUpdate,
    onApplyUpdate: checkUpdate,
    onClose: () => {},
  };
};
