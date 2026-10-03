import { useCallback, useState } from "react";

export type UpdateStatus = "idle" | "checking" | "downloading" | "ready" | "error";

/**
 * Custom build: the updater plugin is not registered, and this hook never
 * checks or downloads. The dialog shape stays the same and simply never opens.
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
